<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AuditLog;
use App\Models\CashAccount;
use App\Models\Disbursement;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\SupportingDocument;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DisbursementService
{
    public function stats(): array
    {
        $active = Disbursement::query()->whereNull('deleted_at');

        return [
            'total' => (clone $active)->count(),
            'pending' => (clone $active)->where('status', 'Pending')->count(),
            'approved' => (clone $active)->where('status', 'Approved')->count(),
            'released' => (clone $active)->where('status', 'Released')->count(),
            'total_paid' => (float) (clone $active)->where('status', 'Released')->sum('amount_paid'),
            'archived' => Disbursement::onlyTrashed()->count(),
            'payroll_pending' => (clone $active)->where('source_type', 'payroll')->where('status', 'Pending')->count(),
        ];
    }

    public function paginate(array $filters, int $perPage = 20)
    {
        $query = Disbursement::query()
            ->with(['accountsPayable', 'department', 'cashAccount', 'creator', 'approver', 'releaser'])
            ->withCount(['supportingDocuments as supporting_documents_count']);

        // Archived toggle — mirrors Expenses/Budgets: default excludes
        // trashed rows, ?archived=1 shows ONLY trashed rows.
        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        // 'ap' | 'payroll'. Accounts Payable disbursements are created and
        // managed here; payroll disbursements are created by the Payroll
        // module and only move through approve/reject/release on this
        // screen — see the guards in update()/archive()/attachDocument().
        if (! empty($filters['source_type'])) {
            $query->where('source_type', $filters['source_type']);
        }

        if (! empty($filters['department_id'])) {
            $query->where('department_id', $filters['department_id']);
        }

        // Payment-date range — a disbursement with a null payment_date
        // (still awaiting payment) is excluded whenever either bound is
        // set, matching the frontend's previous client-side behavior.
        if (! empty($filters['date_from'])) {
            $query->whereNotNull('payment_date')->where('payment_date', '>=', $filters['date_from']);
        }

        if (! empty($filters['date_to'])) {
            $query->whereNotNull('payment_date')->where('payment_date', '<=', $filters['date_to']);
        }

        if (! empty($filters['search'])) {
            $term = '%'.$filters['search'].'%';
            $query->where(function ($q) use ($term) {
                $q->where('voucher_number', 'ilike', $term)
                    ->orWhere('payee', 'ilike', $term)
                    ->orWhere('reference_number', 'ilike', $term)
                    ->orWhere('payroll_batch_number', 'ilike', $term);
            });
        }

        return $query->latest('created_at')->paginate($perPage);
    }

    /**
     * Manual creation via the Disbursements screen is Accounts Payable
     * only — source_type is forced to 'ap' regardless of what's in $data,
     * so this endpoint can never be used to fabricate a payroll record.
     * Payroll requests are expected to arrive through
     * createPayrollRequest() below, called by the Payroll module.
     */
    public function create(array $data, int $userId): Disbursement
    {
        return DB::transaction(function () use ($data, $userId) {
            $ap = AccountsPayable::lockForUpdate()->findOrFail($data['ap_id']);

            if ($data['amount_paid'] > $ap->remaining_balance) {
                throw ValidationException::withMessages([
                    'amount_paid' => 'Payment amount cannot exceed the payable\'s remaining balance ('
                        .number_format((float) ($ap->remaining_balance ?? 0), 2).').',
                ]);
            }

            $disbursement = Disbursement::create([
                ...$data,
                'source_type' => 'ap',
                'status' => 'Pending',
                'created_by' => $userId,
            ]);

            AuditLog::create([
                'user_id' => $userId,
                'module' => 'Disbursements',
                'action' => 'create',
                'record_id' => $disbursement->id,
                'activity_description' => "Created disbursement {$disbursement->voucher_number} for {$disbursement->payee}.",
                'new_values' => $disbursement->only(['ap_id', 'payee', 'amount_paid', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $disbursement;
        });
    }

    /**
     * Entry point for the (future) Payroll module — a requesting
     * department's payroll run lands here as a Pending disbursement with
     * no linked AP record. No AP balance check applies since there's no
     * payable being settled. Not yet wired to a route; add one
     * (permission-gated to the Payroll module's service account/role, not
     * disbursements.manage) when that integration exists.
     */
    public function createPayrollRequest(array $data, int $requestedByUserId): Disbursement
    {
        return DB::transaction(function () use ($data, $requestedByUserId) {
            $disbursement = Disbursement::create([
                ...$data,
                'source_type' => 'payroll',
                'ap_id' => null,
                'status' => 'Pending',
                'created_by' => $requestedByUserId,
            ]);

            AuditLog::create([
                'user_id' => $requestedByUserId,
                'module' => 'Disbursements',
                'action' => 'create',
                'record_id' => $disbursement->id,
                'activity_description' => "Payroll request {$disbursement->voucher_number} submitted for {$disbursement->payee} ({$disbursement->employee_count} employees).",
                'new_values' => $disbursement->only(['payroll_batch_number', 'department_id', 'amount_paid', 'employee_count', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $disbursement;
        });
    }

    public function update(Disbursement $disbursement, array $data, int $userId): Disbursement
    {
        if ($disbursement->status !== 'Pending') {
            throw ValidationException::withMessages([
                'status' => 'Only a pending disbursement can be edited.',
            ]);
        }

        if ($disbursement->isPayroll()) {
            throw ValidationException::withMessages([
                'source_type' => 'Payroll requests cannot be edited here — only approved, rejected, or released.',
            ]);
        }

        return DB::transaction(function () use ($disbursement, $data, $userId) {
            $original = $disbursement->only(['payee', 'amount_paid', 'cash_account_id']);

            $disbursement->update($data);

            AuditLog::create([
                'user_id' => $userId,
                'module' => 'Disbursements',
                'action' => 'update',
                'record_id' => $disbursement->id,
                'activity_description' => "Updated disbursement {$disbursement->voucher_number}.",
                'old_values' => $original,
                'new_values' => $disbursement->only(['payee', 'amount_paid', 'cash_account_id']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $disbursement->fresh();
        });
    }

    /**
     * Authorization step. Does NOT move money yet — release() does that.
     * Splitting these mirrors the two real-world signatures on a check:
     * being authorized to pay vs. the payment actually going out. Applies
     * identically to AP and payroll disbursements.
     */
    public function approve(Disbursement $disbursement, int $approverId): Disbursement
    {
        if ($disbursement->status !== 'Pending') {
            throw ValidationException::withMessages([
                'status' => 'Only a pending disbursement can be approved.',
            ]);
        }

        return DB::transaction(function () use ($disbursement, $approverId) {
            $disbursement->update([
                'status' => 'Approved',
                'approved_by' => $approverId,
                'approved_at' => now(),
            ]);

            AuditLog::create([
                'user_id' => $approverId,
                'module' => 'Disbursements',
                'action' => 'approve',
                'record_id' => $disbursement->id,
                'activity_description' => sprintf(
                    'Approved %s %s for %s (%.2f). Awaiting release.',
                    $disbursement->isPayroll() ? 'payroll disbursement' : 'disbursement',
                    $disbursement->voucher_number,
                    $disbursement->payee,
                    (float) $disbursement->amount_paid
                ),
                'new_values' => ['status' => 'Approved'],
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $disbursement->fresh();
        });
    }

    public function reject(Disbursement $disbursement, int $approverId, ?string $reason = null): Disbursement
    {
        if ($disbursement->status !== 'Pending') {
            throw ValidationException::withMessages([
                'status' => 'Only a pending disbursement can be rejected.',
            ]);
        }

        return DB::transaction(function () use ($disbursement, $approverId, $reason) {
            $disbursement->update([
                'status' => 'Rejected',
                'approved_by' => $approverId,
                'approved_at' => now(),
                'remarks' => $reason ?? $disbursement->remarks,
            ]);

            AuditLog::create([
                'user_id' => $approverId,
                'module' => 'Disbursements',
                'action' => 'reject',
                'record_id' => $disbursement->id,
                'activity_description' => $reason
                    ? "Rejected disbursement {$disbursement->voucher_number}. Reason: {$reason}"
                    : "Rejected disbursement {$disbursement->voucher_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $disbursement->fresh();
        });
    }

    /**
     * The actual payment event. Branches on source_type since AP and
     * payroll settle against different ledgers:
     *  - AP: settles the linked AccountsPayable balance (paid_amount /
     *    remaining_balance / status) and debits the AP control account.
     *  - Payroll: no AccountsPayable record exists, so that side is
     *    skipped entirely; debits a payroll control account instead.
     * Both branches move cash and post a journal entry the same way.
     */
    public function release(Disbursement $disbursement, int $releasedById): Disbursement
    {
        if ($disbursement->status !== 'Approved') {
            throw ValidationException::withMessages([
                'status' => 'Only an approved disbursement can be released.',
            ]);
        }

        return $disbursement->isPayroll()
            ? $this->releasePayroll($disbursement, $releasedById)
            : $this->releaseAp($disbursement, $releasedById);
    }

    /**
     * IMPORTANT: the chart-of-accounts IDs used for the journal lines are
     * NOT guessed — they're read from config('accounting.accounts'), which
     * you need to populate with your real chart_of_accounts.id values
     * (e.g. the Accounts Payable control account, and a mapping from each
     * cash_accounts row to its corresponding chart_of_accounts row). I
     * don't have your seeded chart of accounts, so this throws clearly
     * instead of posting a journal entry against a fabricated account id.
     */
    private function releaseAp(Disbursement $disbursement, int $releasedById): Disbursement
    {
        $apAccountId = config('accounting.accounts.accounts_payable_control');
        $cashAccountChartId = config("accounting.accounts.cash_account_map.{$disbursement->cash_account_id}");

        if (! $apAccountId || ! $cashAccountChartId) {
            throw ValidationException::withMessages([
                'config' => 'Chart-of-accounts mapping is not configured (config/accounting.php). '
                    .'Set accounts_payable_control and cash_account_map before releasing payments.',
            ]);
        }

        return DB::transaction(function () use ($disbursement, $releasedById, $apAccountId, $cashAccountChartId) {
            $ap = AccountsPayable::lockForUpdate()->findOrFail($disbursement->ap_id);
            $cashAccount = CashAccount::lockForUpdate()->findOrFail($disbursement->cash_account_id);

            $newPaid = $ap->paid_amount + $disbursement->amount_paid;
            $newRemaining = $ap->original_amount - $newPaid;

            if ($newRemaining < 0) {
                throw ValidationException::withMessages([
                    'amount_paid' => 'Releasing this payment would overpay the linked payable.',
                ]);
            }

            $ap->update([
                'paid_amount' => $newPaid,
                'remaining_balance' => $newRemaining,
                'status' => $newRemaining <= 0 ? 'Paid' : $ap->status,
            ]);

            $cashBalanceBefore = $cashAccount->current_balance;

            $cashAccount->update([
                'current_balance' => $cashAccount->current_balance - $disbursement->amount_paid,
            ]);

            $journalEntry = JournalEntry::create([
                'transaction_no' => 'DV-'.$disbursement->voucher_number,
                'transaction_date' => now()->toDateString(),
                'description' => "Disbursement {$disbursement->voucher_number} — {$disbursement->payee}",
                'status' => 'Posted',
                'posted_by' => $releasedById,
                'posted_at' => now(),
                'created_by' => $releasedById,
            ]);

            // Debit reduces the AP liability, credit reduces the cash asset —
            // standard payment-of-a-payable double entry.
            JournalEntryLine::insert([
                [
                    'journal_entry_id' => $journalEntry->id,
                    'account_id' => $apAccountId,
                    'debit' => $disbursement->amount_paid,
                    'credit' => 0,
                    'reference_type' => 'disbursement',
                    'reference_id' => $disbursement->id,
                    'remarks' => 'AP settlement',
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'journal_entry_id' => $journalEntry->id,
                    'account_id' => $cashAccountChartId,
                    'debit' => 0,
                    'credit' => $disbursement->amount_paid,
                    'reference_type' => 'disbursement',
                    'reference_id' => $disbursement->id,
                    'remarks' => 'Cash paid out',
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);

            $disbursement->update([
                'status' => 'Released',
                'released_date' => now()->toDateString(),
                'released_by' => $releasedById,
            ]);

            // The single most consequential log entry in this service —
            // real cash left a real account. Captures the full financial
            // picture (amounts, accounts, resulting balances, journal
            // entry reference) directly in the log so this is fully
            // reconstructable later without joining across four tables.
            AuditLog::create([
                'user_id' => $releasedById,
                'module' => 'Disbursements',
                'action' => 'release',
                'record_id' => $disbursement->id,
                'activity_description' => sprintf(
                    'Released disbursement %s: %.2f paid to %s from "%s". AP #%d now %.2f remaining%s. Journal entry %s posted.',
                    $disbursement->voucher_number,
                    (float) $disbursement->amount_paid,
                    $disbursement->payee,
                    $cashAccount->account_name,
                    $ap->id,
                    $newRemaining,
                    $newRemaining <= 0 ? ' — PAID IN FULL' : '',
                    $journalEntry->transaction_no
                ),
                'new_values' => [
                    'amount_paid' => (float) $disbursement->amount_paid,
                    'ap_id' => $ap->id,
                    'ap_remaining_balance' => $newRemaining,
                    'cash_account_id' => $cashAccount->id,
                    'cash_balance_before' => (float) $cashBalanceBefore,
                    'cash_balance_after' => (float) $cashAccount->current_balance,
                    'journal_entry_id' => $journalEntry->id,
                    'journal_entry_no' => $journalEntry->transaction_no,
                ],
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $disbursement->fresh();
        });
    }

    /**
     * Same shape as releaseAp() but with no AccountsPayable to settle —
     * debits a payroll control account (e.g. "Salaries and Wages Payable")
     * instead of the AP control account, and skips every AP-specific step.
     *
     * Set config('accounting.accounts.payroll_disbursement_control') to
     * the chart-of-accounts id for that account before releasing any
     * payroll disbursement — same "don't fabricate an account id" rule as
     * releaseAp().
     */
    private function releasePayroll(Disbursement $disbursement, int $releasedById): Disbursement
    {
        $payrollAccountId = config('accounting.accounts.payroll_disbursement_control');
        $cashAccountChartId = config("accounting.accounts.cash_account_map.{$disbursement->cash_account_id}");

        if (! $payrollAccountId || ! $cashAccountChartId) {
            throw ValidationException::withMessages([
                'config' => 'Chart-of-accounts mapping is not configured (config/accounting.php). '
                    .'Set payroll_disbursement_control and cash_account_map before releasing payroll payments.',
            ]);
        }

        return DB::transaction(function () use ($disbursement, $releasedById, $payrollAccountId, $cashAccountChartId) {
            $cashAccount = CashAccount::lockForUpdate()->findOrFail($disbursement->cash_account_id);

            if ($disbursement->amount_paid > $cashAccount->current_balance) {
                throw ValidationException::withMessages([
                    'amount_paid' => 'Releasing this payroll payment would overdraw the selected cash account.',
                ]);
            }

            $cashBalanceBefore = $cashAccount->current_balance;

            $cashAccount->update([
                'current_balance' => $cashAccount->current_balance - $disbursement->amount_paid,
            ]);

            $journalEntry = JournalEntry::create([
                'transaction_no' => 'DV-'.$disbursement->voucher_number,
                'transaction_date' => now()->toDateString(),
                'description' => "Payroll disbursement {$disbursement->voucher_number} — {$disbursement->payee} ({$disbursement->department?->department_name})",
                'status' => 'Posted',
                'posted_by' => $releasedById,
                'posted_at' => now(),
                'created_by' => $releasedById,
            ]);

            JournalEntryLine::insert([
                [
                    'journal_entry_id' => $journalEntry->id,
                    'account_id' => $payrollAccountId,
                    'debit' => $disbursement->amount_paid,
                    'credit' => 0,
                    'reference_type' => 'disbursement',
                    'reference_id' => $disbursement->id,
                    'remarks' => 'Payroll settlement',
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'journal_entry_id' => $journalEntry->id,
                    'account_id' => $cashAccountChartId,
                    'debit' => 0,
                    'credit' => $disbursement->amount_paid,
                    'reference_type' => 'disbursement',
                    'reference_id' => $disbursement->id,
                    'remarks' => 'Cash paid out',
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);

            $disbursement->update([
                'status' => 'Released',
                'released_date' => now()->toDateString(),
                'released_by' => $releasedById,
            ]);

            AuditLog::create([
                'user_id' => $releasedById,
                'module' => 'Disbursements',
                'action' => 'release',
                'record_id' => $disbursement->id,
                'activity_description' => sprintf(
                    'Released payroll disbursement %s: %.2f paid to %s from "%s" for %s (%d employees, period %s–%s). Journal entry %s posted.',
                    $disbursement->voucher_number,
                    (float) $disbursement->amount_paid,
                    $disbursement->payee,
                    $cashAccount->account_name,
                    $disbursement->department?->department_name,
                    $disbursement->employee_count,
                    optional($disbursement->pay_period_start)->toDateString(),
                    optional($disbursement->pay_period_end)->toDateString(),
                    $journalEntry->transaction_no
                ),
                'new_values' => [
                    'amount_paid' => (float) $disbursement->amount_paid,
                    'department_id' => $disbursement->department_id,
                    'payroll_batch_number' => $disbursement->payroll_batch_number,
                    'employee_count' => $disbursement->employee_count,
                    'cash_account_id' => $cashAccount->id,
                    'cash_balance_before' => (float) $cashBalanceBefore,
                    'cash_balance_after' => (float) $cashAccount->current_balance,
                    'journal_entry_id' => $journalEntry->id,
                    'journal_entry_no' => $journalEntry->transaction_no,
                ],
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $disbursement->fresh();
        });
    }

    public function attachDocument(Disbursement $disbursement, \Illuminate\Http\UploadedFile $file, int $userId): SupportingDocument
    {
        if ($disbursement->isPayroll()) {
            throw ValidationException::withMessages([
                'source_type' => 'Proof of payment is not attached to payroll requests here.',
            ]);
        }

        $path = $file->store("disbursement-proofs/{$disbursement->id}", 'local');

        $document = SupportingDocument::create([
            'reference_type' => 'disbursement',
            'reference_id' => $disbursement->id,
            'file_name' => basename($path),
            'original_name' => $file->getClientOriginalName(),
            'storage_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
            'uploaded_by' => $userId,
            'uploaded_at' => now(),
        ]);

        // Keep the denormalized has_attachment column in sync — see the
        // NOTE on Disbursement::supportingDocuments().
        $disbursement->update(['has_attachment' => true]);

        AuditLog::create([
            'user_id' => $userId,
            'module' => 'Disbursements',
            'action' => 'attach_proof',
            'record_id' => $disbursement->id,
            'activity_description' => "Attached proof of payment \"{$file->getClientOriginalName()}\" to {$disbursement->voucher_number}.",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $document;
    }

    public function archive(Disbursement $disbursement, int $userId): Disbursement
    {
        if ($disbursement->isPayroll()) {
            throw ValidationException::withMessages([
                'source_type' => 'Payroll requests cannot be archived here.',
            ]);
        }

        $disbursement->deleted_by = $userId;
        $disbursement->save();
        $disbursement->delete();

        AuditLog::create([
            'user_id' => $userId,
            'module' => 'Disbursements',
            'action' => 'archive',
            'record_id' => $disbursement->id,
            'activity_description' => "Archived disbursement {$disbursement->voucher_number}.",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $disbursement;
    }

    public function restore(Disbursement $disbursement, int $userId): Disbursement
    {
        $disbursement->deleted_by = null;
        $disbursement->restore();

        AuditLog::create([
            'user_id' => $userId,
            'module' => 'Disbursements',
            'action' => 'restore',
            'record_id' => $disbursement->id,
            'activity_description' => "Restored disbursement {$disbursement->voucher_number}.",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $disbursement->fresh();
    }
}