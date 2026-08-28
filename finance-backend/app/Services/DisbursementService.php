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
                    ->orWhere('reference_number', 'ilike', $term);
            });
        }

        return $query->latest('created_at')->paginate($perPage);
    }

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

    public function update(Disbursement $disbursement, array $data, int $userId): Disbursement
    {
        if ($disbursement->status !== 'Pending') {
            throw ValidationException::withMessages([
                'status' => 'Only a pending disbursement can be edited.',
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
     * being authorized to pay vs. the payment actually going out.
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
                    'Approved disbursement %s for %s (%.2f). Awaiting release.',
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
     * The actual payment event. Per the project's Accounts Payable business
     * rule, a disbursement must: update AP.paid_amount, update
     * AP.remaining_balance, mark the payable Paid when the balance hits
     * zero, and post a journal entry. All four happen atomically here.
     *
     * IMPORTANT: the chart-of-accounts IDs used for the journal lines are
     * NOT guessed — they're read from config('accounting.accounts'), which
     * you need to populate with your real chart_of_accounts.id values
     * (e.g. the Accounts Payable control account, and a mapping from each
     * cash_accounts row to its corresponding chart_of_accounts row). I
     * don't have your seeded chart of accounts, so this throws clearly
     * instead of posting a journal entry against a fabricated account id.
     */
    public function release(Disbursement $disbursement, int $releasedById): Disbursement
    {
        if ($disbursement->status !== 'Approved') {
            throw ValidationException::withMessages([
                'status' => 'Only an approved disbursement can be released.',
            ]);
        }

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

    public function attachDocument(Disbursement $disbursement, \Illuminate\Http\UploadedFile $file, int $userId): SupportingDocument
    {
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