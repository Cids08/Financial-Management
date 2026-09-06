<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\ChartOfAccount;
use App\Models\Expense;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExpenseService
{
    // NotificationService lives in the same App\Services namespace, so no
    // `use` import is needed for it below.
    public function __construct(protected NotificationService $notificationService)
    {
    }

    /**
     * @param array{search?:string,status?:string,budget_id?:int,expense_category_id?:int,expense_date_from?:string,expense_date_to?:string,trashed?:bool,per_page?:int} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = Expense::query()
            ->with(['budget:id,budget_name', 'category:id,category_name', 'supplier:id,supplier_name', 'creator:id,first_name,last_name']);

        if (! empty($filters['trashed'])) {
            $query->onlyTrashed();
        }

        $query
            ->search($filters['search'] ?? null)
            ->status($filters['status'] ?? null)
            ->forBudget($filters['budget_id'] ?? null)
            ->forCategory($filters['expense_category_id'] ?? null)
            ->expenseDateBetween($filters['expense_date_from'] ?? null, $filters['expense_date_to'] ?? null);

        return $query
            ->orderByDesc('expense_date')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 15);
    }

    /**
     * @return array{total:int,total_amount:float,this_month_amount:float,archived:int}
     */
    public function stats(): array
    {
        // Only Approved expenses have actually hit a budget / the ledger,
        // so the amount cards reflect real spend rather than everything
        // ever recorded (which would include Pending and Rejected rows).
        $approved = Expense::query()->where('status', Expense::STATUS_APPROVED);

        $total = Expense::query()->count();
        $totalAmount = (float) (clone $approved)->sum('expense_amount');
        $thisMonthAmount = (float) (clone $approved)
            ->whereBetween('expense_date', [now()->startOfMonth(), now()->endOfMonth()])
            ->sum('expense_amount');
        $archived = Expense::onlyTrashed()->count();

        return [
            'total' => $total,
            'total_amount' => $totalAmount,
            'this_month_amount' => $thisMonthAmount,
            'archived' => $archived,
        ];
    }

    public function create(array $data, User $creator): Expense
    {
        return DB::transaction(function () use ($data, $creator) {
            $expense = Expense::create([
                ...$data,
                'receipt_status' => $data['receipt_status'] ?? Expense::RECEIPT_PENDING,
                'status' => Expense::STATUS_PENDING,
                'is_over_budget' => false,
                'created_by' => $creator->id,
            ]);

            AuditLog::create([
                'user_id' => $creator->id,
                'module' => 'Expenses',
                'action' => 'create',
                'record_id' => $expense->id,
                'activity_description' => "Recorded expense #{$expense->id}.",
                'new_values' => $expense->only(['budget_id', 'expense_category_id', 'expense_amount', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $expense;
        });
    }

    public function update(Expense $expense, array $data, User $actor): Expense
    {
        // Belt-and-suspenders: UpdateExpenseRequest already blocks this,
        // but the service must not trust that it's always called through
        // the HTTP layer.
        if ($expense->status === Expense::STATUS_APPROVED) {
            throw ValidationException::withMessages([
                'status' => 'Approved expenses cannot be edited directly.',
            ]);
        }

        $original = $expense->only(['budget_id', 'expense_category_id', 'expense_amount', 'status']);

        DB::transaction(function () use ($expense, $data, $actor, $original) {
            $expense->update($data);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Expenses',
                'action' => 'update',
                'record_id' => $expense->id,
                'activity_description' => "Updated expense #{$expense->id}.",
                'old_values' => $original,
                'new_values' => $expense->only(['budget_id', 'expense_category_id', 'expense_amount', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });

        return $expense->refresh();
    }

    public function delete(Expense $expense, User $actor): void
    {
        DB::transaction(function () use ($expense, $actor) {
            // deleted_by is stamped in Expense::booted() right before this.
            $expense->delete();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Expenses',
                'action' => 'archive',
                'record_id' => $expense->id,
                'activity_description' => "Archived expense #{$expense->id}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    public function restore(Expense $expense, User $actor): Expense
    {
        DB::transaction(function () use ($expense, $actor) {
            $expense->deleted_by = null;
            $expense->restore();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Expenses',
                'action' => 'restore',
                'record_id' => $expense->id,
                'activity_description' => "Restored expense #{$expense->id}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });

        return $expense->refresh();
    }

    /**
     * Core Budget Management rule (see laravel-backend skill):
     * approving an expense must update the budget's used/remaining
     * amounts, flag over-budget, warn when the threshold is crossed,
     * and post the double-entry journal lines — all atomically.
     *
     * Two guards run before any of that happens:
     *   1. The budget must belong to the same department as whoever
     *      filed the expense — an expense should only ever draw down
     *      its own department's budget, never another department's.
     *      Skippable ONLY for system-generated postings where "who
     *      happened to click the button" has no bearing on which
     *      department the spend belongs to — see $skipDepartmentCheck
     *      below and TaxObligationService::recordAsExpense(), its one
     *      caller. Never set true from anything reachable by a request
     *      the user directly controls the department/budget/creator of.
     *   2. The budget itself must be in a spendable state (not still
     *      Draft, not already Closed) — a budget has its own lifecycle
     *      independent of the expenses filed against it. This check is
     *      never skipped, including for system-generated postings.
     */
    public function approve(Expense $expense, User $approver, bool $skipDepartmentCheck = false): Expense
    {
        if ($expense->status !== Expense::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => "Only pending expenses can be approved (current status: {$expense->status}).",
            ]);
        }

        $expense->loadMissing('creator');

        return DB::transaction(function () use ($expense, $approver, $skipDepartmentCheck) {
            /** @var Budget $budget */
            $budget = Budget::query()->lockForUpdate()->findOrFail($expense->budget_id);

            if (! $skipDepartmentCheck && $expense->creator && $expense->creator->department_id !== $budget->department_id) {
                throw ValidationException::withMessages([
                    'budget' => "This expense's budget belongs to a different department than the person who filed it.",
                ]);
            }

            if ($budget->status !== Budget::STATUS_ACTIVE) {
                throw ValidationException::withMessages([
                    'budget' => "Cannot approve expenses against a budget with status \"{$budget->status}\". The budget must be Active.",
                ]);
            }

            $newUsed = bcadd((string) $budget->used_amount, (string) $expense->expense_amount, 2);
            $newRemaining = bcsub((string) $budget->allocated_amount, $newUsed, 2);
            $isOverBudget = bccomp($newRemaining, '0', 2) < 0;

            $budget->update([
                'used_amount' => $newUsed,
                'remaining_amount' => $newRemaining,
            ]);

            $expense->update([
                'status' => Expense::STATUS_APPROVED,
                'is_over_budget' => $isOverBudget,
            ]);

            $usedPercentage = bccomp((string) $budget->allocated_amount, '0', 2) > 0
                ? (float) bcmul(bcdiv($newUsed, (string) $budget->allocated_amount, 4), '100', 2)
                : 0.0;

            if ($isOverBudget || $usedPercentage >= (float) $budget->warning_percentage) {
                $this->notifyBudgetWarning($budget, $expense, $usedPercentage, $isOverBudget);
            }

            $this->notifyExpenseCreator($expense, approved: true);

            $this->postJournalEntry($expense, $approver);

            // This is the most consequential audit entry in this service —
            // approval moves real budget numbers AND posts a journal entry
            // (a real accounting event). Captures the budget impact
            // directly in the log, not just "approved", since "how much
            // of the budget did this consume and did it go over" is
            // exactly what someone auditing this later will need to know
            // without having to cross-reference the journal separately.
            AuditLog::create([
                'user_id' => $approver->id,
                'module' => 'Expenses',
                'action' => 'approve',
                'record_id' => $expense->id,
                'activity_description' => sprintf(
                    'Approved expense #%d (%.2f) against budget "%s". Budget now %.2f%% used%s.',
                    $expense->id,
                    (float) $expense->expense_amount,
                    $budget->budget_name,
                    $usedPercentage,
                    $isOverBudget ? ' — OVER BUDGET' : ''
                ),
                'new_values' => [
                    'expense_amount' => (float) $expense->expense_amount,
                    'budget_id' => $budget->id,
                    'budget_used_amount' => $newUsed,
                    'budget_remaining_amount' => $newRemaining,
                    'is_over_budget' => $isOverBudget,
                ],
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $expense->refresh();
        });
    }

    public function reject(Expense $expense, ?string $remarks = null): Expense
    {
        if ($expense->status !== Expense::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => "Only pending expenses can be rejected (current status: {$expense->status}).",
            ]);
        }

        DB::transaction(function () use ($expense, $remarks) {
            $expense->update([
                'status' => Expense::STATUS_REJECTED,
                'rejection_remarks' => $remarks,
            ]);

            $this->notifyExpenseCreator($expense, approved: false, reason: $remarks);

            AuditLog::create([
                'user_id' => auth()->id(),
                'module' => 'Expenses',
                'action' => 'reject',
                'record_id' => $expense->id,
                'activity_description' => $remarks
                    ? "Rejected expense #{$expense->id}. Reason: {$remarks}"
                    : "Rejected expense #{$expense->id}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });

        return $expense->refresh();
    }

    /**
     * REFACTOR: routed through NotificationService::create() instead of
     * calling Notification::create() directly, so every service creates
     * notifications the same way (one place to change behavior later —
     * e.g. broadcasting, per-page defaults, dedup rules).
     */
    private function notifyBudgetWarning(Budget $budget, Expense $expense, float $usedPercentage, bool $isOverBudget): void
    {
        $recipientId = $budget->approved_by ?? $budget->created_by;

        if (! $recipientId) {
            return;
        }

        $this->notificationService->create(
            $recipientId,
            $isOverBudget ? 'budget_over' : 'budget_warning',
            $isOverBudget ? 'Budget exceeded' : 'Budget nearing its limit',
            sprintf(
                '%s used %.2f%% of "%s" (%s) after approving expense #%d.',
                $isOverBudget ? 'Over budget:' : 'Warning:',
                $usedPercentage,
                $budget->budget_name,
                $budget->budget_code,
                $expense->id
            ),
        );
    }

    /**
     * Notifies whoever submitted the expense that it was approved or
     * rejected. Separate from notifyBudgetWarning() above — that one
     * tells the budget owner their budget is getting tight; this one
     * tells the expense submitter what happened to their own request.
     * The two can fire independently on the same approve() call and
     * even go to the same person without duplicating content, since
     * they carry different information.
     *
     * `type` is 'expense' — NOT currently in NOTIFICATION_TYPE_META on
     * the frontend (src/utils/notificationTypes.js only maps
     * receivable/payable/budget/forecast/ai_recommendation), so this
     * will render with the default Bell icon and route to /reports until
     * that map is extended with an 'expense' entry.
     *
     * REFACTOR: routed through NotificationService::create() instead of
     * calling Notification::create() directly, so every service creates
     * notifications the same way (one place to change behavior later —
     * e.g. broadcasting, per-page defaults, dedup rules).
     */
    private function notifyExpenseCreator(Expense $expense, bool $approved, ?string $reason = null): void
    {
        if (! $expense->created_by) {
            return;
        }

        $this->notificationService->create(
            $expense->created_by,
            'expense',
            $approved ? 'Expense approved' : 'Expense rejected',
            $approved
                ? sprintf('Your expense #%d was approved.', $expense->id)
                : sprintf('Your expense #%d was rejected.%s', $expense->id, $reason ? " Reason: {$reason}" : ''),
        );
    }

    /**
     * Posts Debit Expense / Credit Cash (or AP) for the approved expense.
     *
     * Requires FINANCE_DEFAULT_EXPENSE_ACCOUNT and FINANCE_EXPENSE_CREDIT_ACCOUNT
     * (or a per-category override) to be configured in config/finance.php —
     * see that file for why this can't be inferred from the schema alone.
     */
    private function postJournalEntry(Expense $expense, User $approver): void
    {
        $categoryCode = $expense->category?->category_code;
        $accountMap = config('finance.expense_approval.category_accounts', []);

        $debitCode = $accountMap[$categoryCode] ?? config('finance.expense_approval.default_expense_account_code');
        $creditCode = config('finance.expense_approval.credit_account_code');

        if (! $debitCode || ! $creditCode) {
            throw ValidationException::withMessages([
                'finance' => 'Expense approval accounts are not configured. Set FINANCE_DEFAULT_EXPENSE_ACCOUNT and FINANCE_EXPENSE_CREDIT_ACCOUNT (see config/finance.php).',
            ]);
        }

        $debitAccount = ChartOfAccount::where('account_code', $debitCode)->firstOrFail();
        $creditAccount = ChartOfAccount::where('account_code', $creditCode)->firstOrFail();

        $entry = JournalEntry::create([
            'transaction_no' => 'JE-EXP-' . $expense->id . '-' . now()->format('YmdHis'),
            'transaction_date' => $expense->expense_date,
            'description' => "Approved expense #{$expense->id}: {$expense->description}",
            'status' => 'Posted',
            'posted_by' => $approver->id,
            'posted_at' => now(),
            'created_by' => $approver->id,
        ]);

        $entry->lines()->createMany([
            [
                'account_id' => $debitAccount->id,
                'debit' => $expense->expense_amount,
                'credit' => 0,
                'reference_type' => Expense::class,
                'reference_id' => $expense->id,
                'remarks' => 'Expense recognized',
            ],
            [
                'account_id' => $creditAccount->id,
                'debit' => 0,
                'credit' => $expense->expense_amount,
                'reference_type' => Expense::class,
                'reference_id' => $expense->id,
                'remarks' => 'Expense settled',
            ],
        ]);
    }
}