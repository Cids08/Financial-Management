<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\ChartOfAccount;
use App\Models\Expense;
use App\Models\JournalEntry;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExpenseService
{
    /**
     * @param array{search?:string,status?:string,budget_id?:int,expense_category_id?:int,trashed?:bool,per_page?:int} $filters
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
            ->forCategory($filters['expense_category_id'] ?? null);

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
        $active = Expense::query();
        $total = (clone $active)->count();
        $totalAmount = (float) (clone $active)->sum('expense_amount');
        $thisMonthAmount = (float) (clone $active)
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
     */
    public function approve(Expense $expense, User $approver): Expense
    {
        if ($expense->status !== Expense::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => "Only pending expenses can be approved (current status: {$expense->status}).",
            ]);
        }

        return DB::transaction(function () use ($expense, $approver) {
            /** @var Budget $budget */
            $budget = Budget::query()->lockForUpdate()->findOrFail($expense->budget_id);

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
                'description' => $remarks
                    ? $expense->description . "\n\n[Rejected] {$remarks}"
                    : $expense->description,
            ]);

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

    private function notifyBudgetWarning(Budget $budget, Expense $expense, float $usedPercentage, bool $isOverBudget): void
    {
        $recipientId = $budget->approved_by ?? $budget->created_by;

        if (! $recipientId) {
            return;
        }

        Notification::create([
            'user_id' => $recipientId,
            'title' => $isOverBudget ? 'Budget exceeded' : 'Budget nearing its limit',
            'message' => sprintf(
                '%s used %.2f%% of "%s" (%s) after approving expense #%d.',
                $isOverBudget ? 'Over budget:' : 'Warning:',
                $usedPercentage,
                $budget->budget_name,
                $budget->budget_code,
                $expense->id
            ),
            'type' => $isOverBudget ? 'budget_over' : 'budget_warning',
            'is_read' => false,
        ]);
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