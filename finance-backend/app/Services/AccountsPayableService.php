<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AuditLog;
use App\Models\ChartOfAccount;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class AccountsPayableService
{
    // NotificationService lives in the same App\Services namespace, so no
    // `use` import is needed for it below.
    public function __construct(protected NotificationService $notificationService)
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
                'reference_number' => $data['reference_number'] ?? null,
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

            $this->notifyCreator($bill, approved: true);

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
        if ($bill->account_id === null) {
            throw new RuntimeException(
                "Bill {$bill->invoice_number} has no expense account set — cannot post journal entry."
            );
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
            'account_id' => $bill->account_id,
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
     * chart of accounts. UNCONFIRMED: assumes that account's code is
     * config('accounting.accounts_payable_account_code'), which now
     * defaults to '2000' — confirmed against this project's real
     * chart_of_accounts data (id 8, code 2000, "Accounts Payable").
     * Previously defaulted to a placeholder '2100', which in this
     * project's real data is actually "Taxes Payable" — if that had
     * gone unnoticed, every approved bill's journal entry would have
     * posted Cr Taxes Payable instead of Cr Accounts Payable. If your
     * chart of accounts ever changes this code, update the config value
     * rather than this default.
     */
    private function resolveAccountsPayableLedgerAccount(): ChartOfAccount
    {
        $code = config('accounting.accounts_payable_account_code', '2000');

        $account = ChartOfAccount::where('account_code', $code)->first();

        if ($account === null) {
            throw new RuntimeException(
                "No chart_of_accounts row found for Accounts Payable (code: {$code}). "
                . "Check config('accounting.accounts_payable_account_code')."
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
     * `type` is 'payable', matching NOTIFICATION_TYPE_META on the
     * frontend (src/utils/notificationTypes.js) — renders with the right
     * icon/route with no frontend change needed.
     *
     * REFACTOR: routed through NotificationService::create() instead of
     * calling Notification::create() directly, so every service creates
     * notifications the same way (one place to change behavior later —
     * e.g. broadcasting, per-page defaults, dedup rules).
     */
    private function notifyCreator(AccountsPayable $bill, bool $approved): void
    {
        if (! $bill->created_by) {
            return;
        }

        $this->notificationService->create(
            $bill->created_by,
            'payable',
            $approved ? 'Bill approved' : 'Bill rejected',
            $approved
                ? sprintf('Your bill %s was approved.', $bill->invoice_number)
                : sprintf('Your bill %s was rejected.', $bill->invoice_number),
        );
    }
}