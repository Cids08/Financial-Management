<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AuditLog;
use App\Models\CashAccount;
use App\Models\ChartOfAccount;
use App\Models\Disbursement;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class AccountsPayableService
{
    public function __construct(protected DisbursementService $disbursementService)
    {
    }

    public function list(bool $withArchived = false): Collection
    {
        $query = AccountsPayable::query()->with(['supplier', 'account', 'creator', 'approver'])->latest('invoice_date');

        return $withArchived
            ? $query->onlyTrashed()->get()
            : $query->get();
    }

    /**
     * Matches AccountsPayable.jsx's stat cards. `payable` sums bills that
     * still represent money owed — excludes both Paid (nothing left owed)
     * and Cancelled (never owed / voided) bills. A Cancelled bill can
     * still carry a nonzero remaining_balance in the DB since cancelling
     * doesn't zero that column out, so excluding only 'Paid' was
     * overcounting real payable exposure by whatever Cancelled bills'
     * balances added up to.
     *
     * See the status-constraint note in StoreAccountsPayableRequest —
     * once the real allowed values are fully confirmed this may need
     * adjusting if these labels aren't spelled exactly this way in the DB.
     */
    public function stats(): array
    {
        $active = AccountsPayable::query();

        return [
            'total' => (clone $active)->count(),
            'payable' => (clone $active)->whereNotIn('status', ['Paid', 'Cancelled'])->sum('remaining_balance'),
            'overdue' => (clone $active)->where('status', 'Overdue')->count(),
            'archived' => AccountsPayable::onlyTrashed()->count(),
        ];
    }

    /**
     * $data: ['supplier_id', 'account_id', 'invoice_number', 'invoice_date',
     * 'due_date', 'amount', 'payment_method', 'billing_address',
     * 'description', 'reference_number', 'status'].
     *
     * account_id is the expense/asset account this bill will debit once
     * approved — see approve() below. It's captured at creation (not
     * derived from the supplier) because one supplier can bill against
     * different account types depending on the job.
     *
     * remaining_balance is NOT NULL in the DB with no default — computed
     * here as original_amount - paid_amount (paid_amount starts at 0 for
     * a brand new bill, since there's no "record a payment" flow yet).
     */
    public function create(User $actor, array $data): AccountsPayable
    {
        return DB::transaction(function () use ($actor, $data) {
            $originalAmount = $data['amount'];
            $paidAmount = 0;

            $bill = AccountsPayable::create([
                'supplier_id' => $data['supplier_id'],
                'account_id' => $data['account_id'],
                'invoice_number' => $data['invoice_number'],
                'invoice_date' => $data['invoice_date'] ?? now()->toDateString(),
                'due_date' => $data['due_date'],
                'billing_address' => $data['billing_address'] ?? null,
                'purchase_order_no' => $data['purchase_order_no'] ?? null,
                'has_attachment' => $data['has_attachment'] ?? false,
                'original_amount' => $originalAmount,
                'paid_amount' => $paidAmount,
                'remaining_balance' => $originalAmount - $paidAmount,
                'payment_method' => $data['payment_method'] ?? null,
                'reference_number' => !empty($data['reference_number']) ? $data['reference_number'] : self::generateReferenceNumber(),
                'status' => $data['status'] ?? 'Pending',
                'remarks' => $data['description'] ?? null,
                'created_by' => $actor->id,
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'create',
                'record_id' => $bill->id,
                'activity_description' => "Created bill {$bill->invoice_number}.",
                'new_values' => $bill->only(['supplier_id', 'account_id', 'invoice_number', 'original_amount', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            $this->notifyApproversOfNewBill($bill, $actor);

            return $bill->load('supplier');
        });
    }

    /**
     * paid_amount isn't editable from this form (no "record a payment" UI
     * yet), so it's preserved as-is and remaining_balance is recomputed
     * against whatever original_amount changes to.
     */
    public function update(User $actor, AccountsPayable $bill, array $data): AccountsPayable
    {
        return DB::transaction(function () use ($actor, $bill, $data) {
            $original = $bill->only(['supplier_id', 'account_id', 'invoice_number', 'original_amount', 'status']);
            $newOriginalAmount = $data['amount'];

            // Second guard alongside UpdateAccountsPayableRequest's
            // validation — defends against this method being called from
            // anywhere that bypasses the FormRequest (console, tests,
            // future code paths), same reasoning as approve()'s
            // idempotency check above.
            if ($newOriginalAmount < (float) $bill->paid_amount) {
                throw new RuntimeException(
                    "Amount for bill {$bill->invoice_number} cannot be less than the amount already paid ({$bill->paid_amount})."
                );
            }

            $bill->fill([
                'supplier_id' => $data['supplier_id'],
                'account_id' => $data['account_id'],
                'invoice_number' => $data['invoice_number'],
                'invoice_date' => $data['invoice_date'] ?? $bill->invoice_date,
                'due_date' => $data['due_date'],
                'billing_address' => $data['billing_address'] ?? null,
                'purchase_order_no' => $data['purchase_order_no'] ?? null,
                'has_attachment' => $data['has_attachment'] ?? $bill->has_attachment,
                'original_amount' => $newOriginalAmount,
                'remaining_balance' => $newOriginalAmount - $bill->paid_amount,
                'payment_method' => $data['payment_method'] ?? null,
                'reference_number' => $data['reference_number'] ?? null,
                'status' => $data['status'] ?? $bill->status,
                'remarks' => $data['description'] ?? null,
            ]);
            $bill->save();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'update',
                'record_id' => $bill->id,
                'activity_description' => "Updated bill {$bill->invoice_number}.",
                'old_values' => $original,
                'new_values' => $bill->only(['supplier_id', 'account_id', 'invoice_number', 'original_amount', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $bill->load('supplier');
        });
    }

    /**
     * Approves the bill AND posts its accrual journal entry:
     *   Dr <bill's account_id>        original_amount
     *   Cr Accounts Payable (liability)   original_amount
     *
     * Per team decision: AP hits the ledger at approval (accrual), not
     * only at payment — payment/disbursement will later post its own
     * entry (Dr Accounts Payable / Cr Cash) once that flow exists, which
     * is a separate service this doesn't attempt to build.
     *
     * Idempotency: this is a second, service-level guard on top of
     * AccountsPayablePolicy::approve() blocking re-approval — defends
     * against this method ever being called directly (e.g. a console
     * command, a queued job, a future code path) that bypasses the
     * policy. Throwing here is intentional: silently no-op-ing an
     * approve() call on financial data would hide a bug instead of
     * surfacing it.
     */
    public function approve(User $actor, AccountsPayable $bill): AccountsPayable
    {
        return DB::transaction(function () use ($actor, $bill) {
            if ($bill->approved_by !== null) {
                throw new RuntimeException("Bill {$bill->invoice_number} is already approved.");
            }

            $bill->update([
                'approved_by' => $actor->id,
                'approved_at' => now(),
            ]);

            $this->postApprovalJournalEntry($actor, $bill);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'approve',
                'record_id' => $bill->id,
                'activity_description' => "Approved bill {$bill->invoice_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            $this->notifyStakeholdersOnApproval($bill, $actor);

            return $bill->load(['supplier', 'account', 'creator', 'approver']);
        });
    }

    /**
     * Rejects an unapproved bill.
     * Sets status to Cancelled and logs the rejection in the audit trail and sends notification.
     */
    public function reject(User $actor, AccountsPayable $bill, ?string $reason = null): AccountsPayable
    {
        return DB::transaction(function () use ($actor, $bill, $reason) {
            if ($bill->approved_by !== null) {
                throw new RuntimeException("Bill {$bill->invoice_number} is already approved and cannot be rejected.");
            }

            if (in_array($bill->status, ['Paid', 'Cancelled'], true)) {
                throw new RuntimeException("Bill {$bill->invoice_number} has status '{$bill->status}' and cannot be rejected.");
            }

            $oldRemarks = $bill->remarks;
            $newRemarks = $reason
                ? ($oldRemarks ? "{$oldRemarks}\n[Rejection reason: {$reason}]" : "Rejection reason: {$reason}")
                : $oldRemarks;

            $bill->update([
                'status' => 'Cancelled',
                'remarks' => $newRemarks,
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'reject',
                'record_id' => $bill->id,
                'activity_description' => $reason
                    ? "Rejected bill {$bill->invoice_number}. Reason: {$reason}"
                    : "Rejected bill {$bill->invoice_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            $this->notifyStakeholdersOnRejection($bill, $actor, $reason);

            return $bill->load(['supplier', 'account', 'creator', 'approver']);
        });
    }

    /**
     * Posts the Dr Expense / Cr Accounts Payable journal entry for a
     * newly-approved bill. Runs inside approve()'s transaction, so a
     * failure here (e.g. missing account_id, misconfigured AP ledger
     * account) rolls back the approval itself rather than leaving the
     * bill marked approved with no corresponding ledger entry.
     */
    private function postApprovalJournalEntry(User $actor, AccountsPayable $bill): void
    {
        $debitAccountId = $bill->account_id;
        if ($debitAccountId === null) {
            $defaultExpenseAccount = ChartOfAccount::where('account_type', 'Expense')->first();
            if ($defaultExpenseAccount) {
                $debitAccountId = $defaultExpenseAccount->id;
                $bill->update(['account_id' => $debitAccountId]);
            } else {
                throw new RuntimeException(
                    "Bill {$bill->invoice_number} has no expense account set and no Expense chart of accounts row exists."
                );
            }
        }

        $apLiabilityAccount = $this->resolveAccountsPayableLedgerAccount();

        $entry = JournalEntry::create([
            // Placeholder numbering scheme — replace with whatever
            // transaction_no format the rest of the app already uses for
            // journal entries (e.g. a shared sequence/service), if one
            // exists. Not having seen that generator, this guarantees
            // uniqueness but may not match your numbering convention.
            'transaction_no' => 'JE-AP-' . $bill->id . '-' . now()->format('YmdHis'),
            'transaction_date' => now()->toDateString(),
            'description' => "Accrual for bill {$bill->invoice_number} ({$bill->supplier?->supplier_name}).",
            'status' => 'Posted',
            'posted_by' => $actor->id,
            'posted_at' => now(),
            'created_by' => $actor->id,
        ]);

        JournalEntryLine::create([
            'journal_entry_id' => $entry->id,
            'account_id' => $debitAccountId,
            'debit' => $bill->original_amount,
            'credit' => 0,
            'reference_type' => 'Accounts Payable',
            'reference_id' => $bill->id,
            'remarks' => "Bill {$bill->invoice_number}",
        ]);

        JournalEntryLine::create([
            'journal_entry_id' => $entry->id,
            'account_id' => $apLiabilityAccount->id,
            'debit' => 0,
            'credit' => $bill->original_amount,
            'reference_type' => 'Accounts Payable',
            'reference_id' => $bill->id,
            'remarks' => "Bill {$bill->invoice_number}",
        ]);
    }

    /**
     * Looks up the single Accounts Payable liability account in the
     * chart of accounts. Uses config('accounting.accounts.
     * accounts_payable_control') — the SAME key DisbursementService::
     * releaseAp() reads for this same account. Kept as config
     * deliberately: there's genuinely only one AP control account, so a
     * single global setting is reasonable here (unlike the old
     * cash_account_map, which needed a value per cash account and had
     * to be hand-edited every time one was added — that side moved to a
     * real column, cash_accounts.chart_of_account_id; this one didn't
     * need to). Confirmed against this project's real chart_of_accounts
     * data: id 8, code 2000, "Accounts Payable".
     */
    private function resolveAccountsPayableLedgerAccount(): ChartOfAccount
    {
        $accountId = config('accounting.accounts.accounts_payable_control');

        $account = $accountId ? ChartOfAccount::find($accountId) : null;

        if ($account === null) {
            $account = ChartOfAccount::where('account_name', 'Accounts Payable')
                ->orWhere('account_code', '2000')
                ->first();
        }

        if ($account === null) {
            $account = ChartOfAccount::where('account_type', 'Liability')->first();
        }

        if ($account === null) {
            throw new RuntimeException(
                "No chart_of_accounts row found for Accounts Payable. "
                . "Please ensure an Accounts Payable (code 2000) or Liability account exists in chart_of_accounts."
            );
        }

        return $account;
    }

    public function archive(User $actor, AccountsPayable $bill): void
    {
        DB::transaction(function () use ($actor, $bill) {
            // Second guard alongside AccountsPayablePolicy::archive() —
            // same reasoning as approve()'s and update()'s guards above:
            // defends against this being called from anywhere that
            // bypasses the policy. An approved bill has a real journal
            // entry posted against it with no reversal flow to undo it,
            // so archiving it here would leave the ledger holding an
            // expense with no corresponding active bill.
            if ($bill->approved_by !== null) {
                throw new RuntimeException(
                    "Bill {$bill->invoice_number} is approved and cannot be archived — no void/reversal flow exists yet."
                );
            }

            $bill->update(['deleted_by' => $actor->id]);
            $bill->delete();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'archive',
                'record_id' => $bill->id,
                'activity_description' => "Archived bill {$bill->invoice_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    public function restore(User $actor, AccountsPayable $bill): void
    {
        DB::transaction(function () use ($actor, $bill) {
            $bill->restore();
            $bill->update(['deleted_by' => null]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'restore',
                'record_id' => $bill->id,
                'activity_description' => "Restored bill {$bill->invoice_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    /**
     * Notifies whoever created the bill about an approval decision. There
     * is no reject() on this service today (only approve() exists, always
     * calling this with approved: true), but the message/title now
     * actually branch on $approved instead of hardcoding the "approved"
     * copy — so this doesn't silently mislabel notifications the moment a
     * reject flow gets added later.
     *
     * CORRECTED: `type` is NOT a per-module category — confirmed via
     * notifications_type_check that it's a generic severity level,
     * constrained to Info/Success/Warning/Error only. The original
     * assumption that `type: 'payable'` would match a frontend
     * NOTIFICATION_TYPE_META lookup for AP-specific icon/routing was
     * wrong and would have violated this DB constraint on every approval.
     * Mapped to the closest real severity instead. If the frontend does
     * need a way to know "this notification is about Accounts Payable"
     * for routing/icons, that has to come from some other field (title
     * parsing, or a column this table has that isn't being set here) —
     * not from `type`. Worth checking the Notification model/migration
     * and the frontend's actual notification-routing logic to confirm
     * what that mechanism really is before assuming AP notifications
     * link anywhere useful once clicked.
     */

    /**
     * Notify approvers (Admins, Super Admins, CEO) when a new bill is created by Finance
     * so they know an Accounts Payable bill requires approval.
     */
     private function notifyApproversOfNewBill(AccountsPayable $bill, User $creator): void
     {
         $adminIds = User::whereHas('role', function ($query) {
             $query->whereIn('name', ['admin', 'super-admin', 'Super Admin', 'Admin']);
         })->where('id', '!=', $creator->id)->pluck('id')->all();

         $bill->loadMissing('supplier');
         $supplierName = $bill->supplier?->supplier_name ?? 'Supplier';
         $formattedAmount = number_format((float) $bill->original_amount, 2);

         foreach ($adminIds as $adminId) {
             Notification::create([
                 'user_id' => $adminId,
                 'title' => 'Bill awaiting approval',
                 'message' => "Bill {$bill->invoice_number} ({$supplierName}) for ₱{$formattedAmount} was submitted by {$creator->fullName()} and is awaiting approval.",
                 'type' => 'Info',
                 'is_read' => false,
             ]);
         }
     }

    /**
     * Notify creator and stakeholders when a bill has been approved and posted to the General Ledger.
     */
    private function notifyStakeholdersOnApproval(AccountsPayable $bill, User $actor): void
    {
        $bill->loadMissing('supplier');
        $supplierName = $bill->supplier?->supplier_name ?? 'Supplier';
        $formattedAmount = number_format((float) $bill->original_amount, 2);

        // Notify the creator (Finance person) that their bill was approved
        if ($bill->created_by && $bill->created_by !== $actor->id) {
            Notification::create([
                'user_id' => $bill->created_by,
                'title' => 'Bill approved',
                'message' => "Your bill {$bill->invoice_number} ({$supplierName}) for ₱{$formattedAmount} was approved by {$actor->fullName()} and posted to the General Ledger.",
                'type' => 'Success',
                'is_read' => false,
            ]);
        } elseif ($bill->created_by) {
            Notification::create([
                'user_id' => $bill->created_by,
                'title' => 'Bill approved',
                'message' => "Bill {$bill->invoice_number} ({$supplierName}) for ₱{$formattedAmount} was approved and posted to the General Ledger.",
                'type' => 'Success',
                'is_read' => false,
            ]);
        }
    }

    /**
     * Notify the creator when a bill has been rejected.
     */
    private function notifyStakeholdersOnRejection(AccountsPayable $bill, User $actor, ?string $reason = null): void
    {
        $bill->loadMissing('supplier');
        $supplierName = $bill->supplier?->supplier_name ?? 'Supplier';

        if ($bill->created_by) {
            Notification::create([
                'user_id' => $bill->created_by,
                'title' => 'Bill rejected',
                'message' => $reason
                    ? "Your bill {$bill->invoice_number} ({$supplierName}) was rejected by {$actor->fullName()}. Reason: {$reason}"
                    : "Your bill {$bill->invoice_number} ({$supplierName}) was rejected by {$actor->fullName()}.",
                'type' => 'Warning',
                'is_read' => false,
            ]);
        }
    }

    /**
     * Attach a supporting document (invoice scan/photo) to a bill, via
     * the shared supporting_documents table — same pattern as
     * ExpenseService::attachReceipt() / CollectionService::attachProof().
     * reference_type = 'accounts_payable' to match this module's own
     * naming (singular snake_case, consistent with 'expense'/'collection'
     * elsewhere in that shared table).
     *
     * Re-uploading adds a new version rather than replacing the previous
     * one — full history preserved, same as the Expense/Collection
     * equivalents.
     *
     * Syncs has_attachment to true on a successful attach, same reasoning
     * ExpenseService documents for receipt_status: that field exists
     * specifically to reflect whether a real file is on record, so it
     * shouldn't be manually toggled independent of whether one actually
     * exists (previously it was just a raw checkbox in the Add/Edit form
     * with no file behind it at all — this replaces that).
     *
     * No status/approval restriction — see
     * AccountsPayablePolicy::attachDocument() for why.
     *
     * Storage path: accounts-payable-documents/{bill_id}/{filename}
     */
    public function attachDocument(AccountsPayable $bill, \Illuminate\Http\UploadedFile $file, User $actor): \App\Models\SupportingDocument
    {
        $path = $file->store("accounts-payable-documents/{$bill->id}", 'local');

        $document = \App\Models\SupportingDocument::create([
            'reference_type' => 'accounts_payable',
            'reference_id' => $bill->id,
            'file_name' => basename($path),
            'original_name' => $file->getClientOriginalName(),
            'storage_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
            'uploaded_by' => $actor->id,
            'uploaded_at' => now(),
        ]);

        $bill->update(['has_attachment' => true]);

        AuditLog::create([
            'user_id' => $actor->id,
            'module' => 'Accounts Payable',
            'action' => 'attach_document',
            'record_id' => $bill->id,
            'activity_description' => "Attached document \"{$file->getClientOriginalName()}\" to bill {$bill->invoice_number}.",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $document;
    }

    /**
     * Return all supporting documents for a bill, newest first. The
     * first item is the current/latest document. Mirrors
     * ExpenseService::getReceiptHistory() / CollectionService::getProofHistory() exactly.
     *
     * @return Collection<int, \App\Models\SupportingDocument>
     */
    public function getDocumentHistory(AccountsPayable $bill): Collection
    {
        return \App\Models\SupportingDocument::query()
            ->with('uploader:id,first_name,last_name')
            ->where('reference_type', 'accounts_payable')
            ->where('reference_id', $bill->id)
            ->orderByDesc('uploaded_at')
            ->orderByDesc('id')
            ->get()
            ->map(function (\App\Models\SupportingDocument $doc) {
                $doc->uploaded_by_name = $doc->uploader
                    ? trim("{$doc->uploader->first_name} {$doc->uploader->last_name}")
                    : null;
                $doc->has_file = (bool) $doc->storage_path;
                return $doc;
            });
    }

    public static function generateReferenceNumber(): string
    {
        $last = AccountsPayable::withTrashed()
            ->where('reference_number', 'like', 'REF-AP-%')
            ->orderByDesc('id')
            ->value('reference_number');

        $nextNum = 1;
        if ($last && preg_match('/REF-AP-(\d+)/i', $last, $matches)) {
            $nextNum = (int) $matches[1] + 1;
        } else {
            $count = AccountsPayable::withTrashed()->count();
            $nextNum = $count + 1;
        }

        while (AccountsPayable::withTrashed()->where('reference_number', sprintf('REF-AP-%03d', $nextNum))->exists()) {
            $nextNum++;
        }

        return sprintf('REF-AP-%03d', $nextNum);
    }

    // -------------------------------------------------------------------------
    // AP Payment Wizard — Automated Batch Payment Run
    // -------------------------------------------------------------------------

    /**
     * Build a list of approved bills that are eligible for payment, together
     * with any pending disbursements so the caller knows how much is still
     * safe to pay on each bill without double-paying.
     *
     * @param  array{
     *   horizon?: int,           // days from today (null/0 = all)
     *   supplier_id?: int|null,
     *   department_id?: int|null,
     * } $filters
     * @return array{ proposals: array, totals: array }
     */
    public function getPaymentProposals(array $filters = []): array
    {
        $today = Carbon::today();

        $query = AccountsPayable::with(['supplier', 'account'])
            ->whereNotNull('approved_by')
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->where('remaining_balance', '>', 0);

        // Horizon filter: only bills due within N days
        if (!empty($filters['horizon'])) {
            $query->whereDate('due_date', '<=', $today->copy()->addDays((int) $filters['horizon']));
        }

        // Optional supplier filter
        if (!empty($filters['supplier_id'])) {
            $query->where('supplier_id', $filters['supplier_id']);
        }

        // Optional department filter (stored as metadata / notes — skip if column absent)
        // Only filter if the column actually exists to avoid query errors on older schemas
        if (!empty($filters['department_id'])) {
            $query->where('department_id', $filters['department_id']);
        }

        $bills = $query->orderBy('due_date')->get();

        $proposals = $bills->map(function (AccountsPayable $bill) use ($today) {
            // Sum of existing Pending/Approved disbursements so we don't suggest double-pay
            $pendingTotal = Disbursement::where('ap_id', $bill->id)
                ->whereIn('status', ['Pending', 'Approved'])
                ->sum('amount_paid');

            $availableToPay = max(0, (float) $bill->remaining_balance - (float) $pendingTotal);

            $dueDate = Carbon::parse($bill->due_date);
            $daysLeft = $today->diffInDays($dueDate, false); // negative = overdue

            if ($daysLeft < 0) {
                $urgency = 'Overdue';
                $urgencyDays = abs((int) $daysLeft);
            } elseif ($daysLeft === 0) {
                $urgency = 'Due Today';
                $urgencyDays = 0;
            } else {
                $urgency = 'Due in ' . (int) $daysLeft . ' days';
                $urgencyDays = (int) $daysLeft;
            }

            return [
                'ap_id'                    => $bill->id,
                'invoice_number'           => $bill->invoice_number,
                'reference_number'         => $bill->reference_number,
                'supplier_id'              => $bill->supplier_id,
                'supplier_name'            => $bill->supplier?->supplier_name ?? $bill->supplier?->name ?? '—',
                'invoice_date'             => $bill->invoice_date?->toDateString(),
                'due_date'                 => $bill->due_date?->toDateString(),
                'original_amount'          => (float) $bill->original_amount,
                'paid_amount'              => (float) $bill->paid_amount,
                'remaining_balance'        => (float) $bill->remaining_balance,
                'pending_disbursements'    => (float) $pendingTotal,
                'available_to_pay'         => $availableToPay,
                'amount_to_pay'            => $availableToPay,  // default — UI can override per-row
                'urgency'                  => $urgency,
                'urgency_days'             => $urgencyDays,
                'status'                   => $bill->status,
                'has_attachment'           => (bool) $bill->has_attachment,
            ];
        })->filter(fn ($p) => $p['available_to_pay'] > 0)->values();

        // Split into eligible (with invoice docs) and withheld (no docs).
        // "No Document, No Payment" policy: only bills that have a supporting
        // invoice/delivery receipt attached can be included in a payment run.
        $eligible = $proposals->filter(fn ($p) => $p['has_attachment'])->values();
        $withheld = $proposals->filter(fn ($p) => !$p['has_attachment'])->values();

        $totals = [
            'count'                    => $eligible->count(),
            'total_available'          => round($eligible->sum('available_to_pay'), 2),
            'total_overdue'            => $eligible->where('urgency', 'Overdue')->count(),
            'attachment_missing_count' => $withheld->count(),
            'withheld_invoices'        => $withheld->pluck('invoice_number')->filter()->values()->toArray(),
        ];

        return [
            'proposals' => $eligible->toArray(),
            'totals'    => $totals,
        ];
    }

    /**
     * Execute a Payment Run: create a Pending disbursement for each selected
     * proposal via DisbursementService::create(). All-or-nothing transaction.
     * The disbursements still need to be Released through the normal workflow.
     *
     * @param  User  $user
     * @param  array{
     *   cash_account_id: int,
     *   payment_method: string,
     *   payment_date: string,
     *   department_id?: int|null,
     *   proposals: array<array{ap_id: int, amount_to_pay: float}>
     * } $data
     * @return array{ disbursements: array, total_amount: float, count: int }
     */
    public function executePaymentRun(User $user, array $data): array
    {
        // 1. Load and lock cash account to check balance
        $cashAccount = CashAccount::lockForUpdate()->findOrFail($data['cash_account_id']);

        $totalProposed = collect($data['proposals'])->sum('amount_to_pay');

        if ((float) $totalProposed > (float) $cashAccount->current_balance) {
            throw new RuntimeException(
                sprintf(
                    'Insufficient cash account balance. Available: ₱%s, Required: ₱%s.',
                    number_format($cashAccount->current_balance, 2),
                    number_format($totalProposed, 2)
                )
            );
        }

        $created = [];

        DB::transaction(function () use ($user, $data, &$created) {
            foreach ($data['proposals'] as $proposal) {
                $bill = AccountsPayable::findOrFail($proposal['ap_id']);

                // "No Document, No Payment" — enforce at execution time as well,
                // even if the wizard already filtered the proposal list, to guard
                // against any direct API calls that bypass the UI.
                if (! $bill->has_attachment) {
                    throw new RuntimeException(
                        "Bill \"{$bill->invoice_number}\" cannot be included in a payment run: "
                        . 'a supporting invoice or delivery receipt document must be attached to the bill first.'
                    );
                }

                $disbursement = $this->disbursementService->create([
                    'ap_id'           => $bill->id,
                    'source_type'     => 'ap',
                    'cash_account_id' => $data['cash_account_id'],
                    'payee'           => $bill->supplier?->supplier_name ?? $bill->supplier?->name ?? 'Unknown',
                    'amount_paid'     => $proposal['amount_to_pay'],
                    'payment_method'  => $data['payment_method'],
                    'payment_date'    => $data['payment_date'],
                    'department_id'   => $data['department_id'] ?? null,
                    'remarks'         => 'Created via Payment Run on ' . now()->toDateString(),
                ], $user->id);

                $created[] = [
                    'disbursement_id' => $disbursement->id,
                    'voucher_number'  => $disbursement->voucher_number,
                    'ap_id'           => $bill->id,
                    'invoice_number'  => $bill->invoice_number,
                    'payee'           => $disbursement->payee,
                    'amount_paid'     => (float) $disbursement->amount_paid,
                    'status'          => $disbursement->status,
                ];
            }

            $firstDisbursementId = !empty($created) ? $created[0]['disbursement_id'] : (int) $data['cash_account_id'];
            $totalAmountPaid = (float) collect($created)->sum('amount_paid');
            $billsCount = count($created);

            AuditLog::create([
                'user_id'              => $user->id,
                'module'               => 'Accounts Payable',
                'action'               => 'payment_run',
                'record_id'            => $firstDisbursementId,
                'activity_description' => "Executed batch payment run of {$billsCount} bills totaling ₱" . number_format($totalAmountPaid, 2) . ".",
                'old_values'           => null,
                'new_values'           => [
                    'cash_account_id' => $data['cash_account_id'],
                    'payment_method'  => $data['payment_method'],
                    'total_amount'    => $totalAmountPaid,
                    'bills_count'     => $billsCount,
                    'vouchers'        => collect($created)->pluck('voucher_number')->toArray(),
                ],
                'ip_address'           => request()->ip(),
                'user_agent'           => request()->userAgent(),
            ]);

            // Notify disbursement approvers and administrators of the batch payment run
            try {
                $recipientIds = User::whereHas('role.permissions', function ($q) {
                    $q->whereIn('name', ['disbursements.approve', 'disbursements.manage']);
                })->orWhereHas('role', function ($q) {
                    $q->whereIn('name', ['admin', 'super-admin', 'Super Admin', 'Admin', 'Finance Manager']);
                })->pluck('id')->push($user->id)->unique()->filter()->all();

                $formattedTotal = number_format($totalAmountPaid, 2);
                foreach ($recipientIds as $recipientId) {
                    Notification::create([
                        'user_id' => $recipientId,
                        'title'   => 'Payment Run Executed',
                        'message' => "Batch payment run settled {$billsCount} bills for a total of ₱{$formattedTotal}. Generated vouchers are pending release in Disbursements.",
                        'type'    => 'Info',
                        'is_read' => false,
                    ]);
                }
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning("Failed to dispatch payment run notification: {$e->getMessage()}");
            }
        });

        return [
            'disbursements' => $created,
            'total_amount'  => collect($created)->sum('amount_paid'),
            'count'         => count($created),
        ];
    }
}