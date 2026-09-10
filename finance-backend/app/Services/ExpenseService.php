<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\ChartOfAccount;
use App\Models\Department;
use App\Models\Expense;
use App\Models\JournalEntry;
use App\Models\Notification;
use App\Models\SupportingDocument;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExpenseService
{
    /**
     * @param array{search?:string,status?:string,budget_id?:int,expense_category_id?:int,expense_date_from?:string,expense_date_to?:string,trashed?:bool,per_page?:int} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = Expense::query()
            ->with([
                'budget:id,budget_name,remaining_amount,allocated_amount',
                'category:id,category_name',
                'supplier:id,supplier_name',
                'cashAccount:id,account_name,account_code,bank_name,current_balance',
                'creator:id,first_name,last_name'
            ])
            // Backs Expense::getHasReceiptAttribute() — without this, the
            // has_receipt accessor falls back to a live exists() query per
            // row, N+1-ing across every expense on the page. Mirrors
            // BudgetService::paginate()'s withCount for has_plan exactly.
            ->withCount(['supportingDocuments as supporting_documents_count']);

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
            if (empty($data['expense_source']) && ! empty($data['cash_account_id'])) {
                $cashAcc = CashAccount::find($data['cash_account_id']);
                if ($cashAcc) {
                    $data['expense_source'] = $cashAcc->account_name;
                }
            }

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
        // Belt-and-suspenders: ExpensePolicy::update() already blocks this,
        // but the service must not trust that it's always called through
        // the HTTP layer. Only Pending expenses may be edited.
        if ($expense->status !== Expense::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => 'Only Pending expenses can be edited.',
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
     *      Skippable for two callers only:
     *        (a) System-generated postings, where "who happens to click
     *            the button" has no bearing on the department — see
     *            TaxObligationService::recordAsExpense().
     *        (b) A Super Admin/Admin approver overriding the check —
     *            see ExpenseController::approve()'s $isAdminOverride.
     *      Never set true from anything a non-admin request can trigger
     *      directly.
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

        if (! $expense->has_receipt) {
            throw ValidationException::withMessages([
                'receipt' => 'This expense cannot be approved without an attached receipt document.',
            ]);
        }

        $expense->loadMissing('creator');

        return DB::transaction(function () use ($expense, $approver, $skipDepartmentCheck) {
            if (! $expense->budget_id) {
                throw ValidationException::withMessages([
                    'budget' => "Cannot approve expense #{$expense->id}: No budget is assigned to this expense.",
                ]);
            }

            /** @var Budget|null $budget */
            $budget = Budget::query()->lockForUpdate()->find($expense->budget_id);

            if (! $budget) {
                throw ValidationException::withMessages([
                    'budget' => "Cannot approve expense #{$expense->id}: The assigned budget (ID: {$expense->budget_id}) does not exist or has been deleted.",
                ]);
            }

            if (! $skipDepartmentCheck && $expense->creator && $expense->creator->department_id !== $budget->department_id) {
                $filerDeptName = Department::find($expense->creator->department_id)?->department_name;
                $budgetDeptName = Department::find($budget->department_id)?->department_name ?? 'no department';
                $filerPhrase = $filerDeptName
                    ? "under the {$filerDeptName} department"
                    : 'without an assigned department';

                throw ValidationException::withMessages([
                    'budget' => sprintf(
                        '%s filed this expense %s, but budget "%s" belongs to %s. An expense can only be approved against a budget owned by the same department as whoever filed it.',
                        $expense->creator->first_name ?? 'This user',
                        $filerPhrase,
                        $budget->budget_name,
                        $budgetDeptName
                    ),
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

            if ($isOverBudget) {
                throw ValidationException::withMessages([
                    'expense_amount' => sprintf(
                        'Cannot approve expense #%d: The amount (₱%s) exceeds the remaining budget for "%s" (Available: ₱%s). Budget overrun is not permitted.',
                        $expense->id,
                        number_format((float) $expense->expense_amount, 2),
                        $budget->budget_name,
                        number_format((float) $budget->remaining_amount, 2)
                    ),
                ]);
            }

            $budget->update([
                'used_amount' => $newUsed,
                'remaining_amount' => $newRemaining,
            ]);

            $expense->update([
                'status'       => Expense::STATUS_APPROVED,
                'is_over_budget' => $isOverBudget,
                'approved_by'  => $approver->id,
                'approved_at'  => now(),
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

    /**
     * Get pending expenses proposal run for the Batch Approval Wizard.
     * Enforces "No Document, No Payment": splits into eligible (has_receipt)
     * and withheld (no receipt attached), exactly like AP's getPaymentProposals.
     *
     * @param array{budget_id?:int,expense_category_id?:int,expense_date_from?:string,expense_date_to?:string} $filters
     * @return array{proposals:array, totals:array}
     */
    public function getApprovalProposals(array $filters = []): array
    {
        $query = Expense::query()
            ->with([
                'budget:id,budget_name,remaining_amount,allocated_amount',
                'category:id,category_name',
                'supplier:id,supplier_name',
                'cashAccount:id,account_name,account_code,bank_name,current_balance',
                'creator:id,first_name,last_name'
            ])
            ->withCount(['supportingDocuments as supporting_documents_count'])
            ->where('status', Expense::STATUS_PENDING);

        if (! empty($filters['budget_id'])) {
            $query->forBudget((int) $filters['budget_id']);
        }
        if (! empty($filters['expense_category_id'])) {
            $query->forCategory((int) $filters['expense_category_id']);
        }
        if (! empty($filters['expense_date_from']) || ! empty($filters['expense_date_to'])) {
            $query->expenseDateBetween($filters['expense_date_from'] ?? null, $filters['expense_date_to'] ?? null);
        }

        $expenses = $query->orderBy('expense_date')->orderBy('id')->get();

        // Split into eligible (has receipt attached) and withheld (missing proof)
        $eligible = $expenses->filter(fn (Expense $e) => $e->has_receipt)->values();
        $withheld = $expenses->filter(fn (Expense $e) => ! $e->has_receipt)->values();

        $proposals = $eligible->map(function (Expense $e) {
            return [
                'id'                      => $e->id,
                'description'             => $e->description,
                'expense_amount'          => (float) $e->expense_amount,
                'expense_date'            => $e->expense_date?->toDateString(),
                'receipt_number'          => $e->receipt_number,
                'expense_source'          => $e->expense_source,
                'budget_id'               => $e->budget_id,
                'budget_name'             => $e->budget?->budget_name ?? '—',
                'budget_remaining_amount' => $e->budget ? (float) $e->budget->remaining_amount : null,
                'expense_category_id'     => $e->expense_category_id,
                'expense_category_name'   => $e->category?->category_name ?? '—',
                'cash_account_id'         => $e->cash_account_id,
                'cash_account_name'       => $e->cashAccount?->account_name ?? '—',
                'cash_account_bank'       => $e->cashAccount?->bank_name ?? $e->cashAccount?->account_code ?? '',
                'cash_account_balance'    => $e->cashAccount ? (float) $e->cashAccount->current_balance : null,
                'supplier_id'             => $e->supplier_id,
                'supplier_name'           => $e->supplier?->supplier_name ?? '—',
                'is_over_budget'          => (bool) $e->is_over_budget,
                'has_receipt'             => true,
            ];
        })->toArray();

        $totals = [
            'count'                    => $eligible->count(),
            'total_amount'             => round((float) $eligible->sum('expense_amount'), 2),
            'attachment_missing_count' => $withheld->count(),
            'withheld_expenses'        => $withheld->pluck('description')->take(5)->toArray(),
        ];

        return [
            'proposals' => $proposals,
            'totals'    => $totals,
        ];
    }

    /**
     * Batch approves and pays multiple pending expenses in a single atomic transaction.
     * Enforces strict documentary controls (all must have receipts), verifies that
     * aggregate expenditures don't exceed cash balances or departmental budgets,
     * updates budgets, deducts cash accounts, and posts double-entry GL journal entries.
     */
    public function batchApprove(array $expenseIds, User $approver, bool $skipDepartmentCheck = false): array
    {
        return DB::transaction(function () use ($expenseIds, $approver, $skipDepartmentCheck) {
            $expenses = Expense::whereIn('id', $expenseIds)
                ->lockForUpdate()
                ->get();

            if ($expenses->isEmpty()) {
                throw ValidationException::withMessages([
                    'expense_ids' => 'No matching expenses were found.',
                ]);
            }

            // 1. Validate all are Pending
            $notPending = $expenses->filter(fn ($e) => $e->status !== Expense::STATUS_PENDING);
            if ($notPending->isNotEmpty()) {
                $ids = $notPending->pluck('id')->join(', #');
                throw ValidationException::withMessages([
                    'expense_ids' => "The following expense(s) are not in Pending status and cannot be approved: #{$ids}.",
                ]);
            }

            // 2. Validate strict documentary controls ("No Document, No Payment")
            $missingReceipt = $expenses->filter(fn ($e) => ! $e->has_receipt);
            if ($missingReceipt->isNotEmpty()) {
                $ids = $missingReceipt->pluck('id')->join(', #');
                throw ValidationException::withMessages([
                    'expense_ids' => "The following expense(s) cannot be approved because they lack an attached receipt document: #{$ids}.",
                ]);
            }

            // 3. Check aggregate cash account balances
            $expensesByCashAccount = $expenses->groupBy('cash_account_id');
            foreach ($expensesByCashAccount as $cashAccountId => $group) {
                if ($cashAccountId) {
                    /** @var CashAccount|null $cashAccount */
                    $cashAccount = CashAccount::lockForUpdate()->find($cashAccountId);
                    if ($cashAccount) {
                        $totalGroupAmount = (float) $group->sum('expense_amount');
                        if ($totalGroupAmount > (float) $cashAccount->current_balance) {
                            throw ValidationException::withMessages([
                                'expense_ids' => sprintf(
                                    'Approving this batch would overdraw cash account "%s" (Available: ₱%s, Required for batch: ₱%s).',
                                    $cashAccount->account_name,
                                    number_format($cashAccount->current_balance, 2),
                                    number_format($totalGroupAmount, 2)
                                ),
                            ]);
                        }
                    }
                }
            }

            // 4. Check aggregate budget limits
            $expensesByBudget = $expenses->groupBy('budget_id');
            foreach ($expensesByBudget as $budgetId => $group) {
                if ($budgetId) {
                    /** @var Budget|null $budget */
                    $budget = Budget::lockForUpdate()->find($budgetId);
                    if ($budget) {
                        $totalGroupAmount = (string) $group->sum('expense_amount');
                        if (bccomp($totalGroupAmount, (string) $budget->remaining_amount, 2) > 0) {
                            throw ValidationException::withMessages([
                                'expense_ids' => sprintf(
                                    'Cannot approve batch: Total expense amount (₱%s) for budget "%s" exceeds its available balance (₱%s). Budget overrun is not permitted.',
                                    number_format((float) $totalGroupAmount, 2),
                                    $budget->budget_name,
                                    number_format((float) $budget->remaining_amount, 2)
                                ),
                            ]);
                        }
                    }
                }
            }

            // 5. Sequentially execute individual approval for each expense
            $approvedExpenses = [];
            $totalAmount = 0;

            foreach ($expenses as $expense) {
                $approved = $this->approve($expense, $approver, $skipDepartmentCheck);
                $approvedExpenses[] = $approved;
                $totalAmount += (float) $approved->expense_amount;
            }

            return [
                'count'        => count($approvedExpenses),
                'total_amount' => $totalAmount,
                'approved_ids' => $expenses->pluck('id')->all(),
            ];
        });
    }

    public function reject(Expense $expense, User $actor, ?string $remarks = null): Expense
    {
        if ($expense->status !== Expense::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => "Only pending expenses can be rejected (current status: {$expense->status}).",
            ]);
        }

        $trimmedRemarks = trim($remarks ?? '');
        if ($trimmedRemarks === '') {
            throw ValidationException::withMessages([
                'remarks' => 'A reason for rejection is required.',
            ]);
        }

        DB::transaction(function () use ($expense, $actor, $trimmedRemarks) {
            $expense->update([
                'status'           => Expense::STATUS_REJECTED,
                'rejection_remarks' => $trimmedRemarks,
                'rejected_by'      => $actor->id,
                'rejected_at'      => now(),
            ]);

            $this->notifyExpenseCreator($expense, approved: false, reason: $trimmedRemarks);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Expenses',
                'action' => 'reject',
                'record_id' => $expense->id,
                'activity_description' => "Rejected expense #{$expense->id}. Reason: {$trimmedRemarks}",
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
            // notifications.type has a DB CHECK constraint limiting it to
            // exactly Info/Success/Warning/Error — 'budget_over'/
            // 'budget_warning' were never legal values and would have
            // thrown a 23514 check violation on every single call, the
            // same way 'expense' below did. Error carries the right
            // severity for over-budget; Warning for merely approaching
            // the threshold. Same convention CollectionService::
            // notifyCreator() already uses correctly.
            'type' => $isOverBudget ? 'Error' : 'Warning',
            'is_read' => false,
        ]);
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
     * `type` must be one of Info/Success/Warning/Error (DB CHECK
     * constraint on notifications.type) — 'expense' was never a legal
     * value and crashed every single approve()/reject() call with a
     * 23514 check violation the moment it tried to insert this row.
     * Matches CollectionService::notifyCreator()'s exact convention:
     * Success for the positive outcome, Warning for the negative one.
     * The frontend's NOTIFICATION_TYPE_META being keyed on module names
     * rather than these four DB values is a separate, cosmetic-only
     * concern (wrong icon/route) — this fix is about the insert not
     * crashing at all, which is the bug that actually needed fixing.
     */
    private function notifyExpenseCreator(Expense $expense, bool $approved, ?string $reason = null): void
    {
        if (! $expense->created_by) {
            return;
        }

        Notification::create([
            'user_id' => $expense->created_by,
            'title'   => $approved ? 'Expense Approved' : 'Expense Rejected',
            'message' => $approved
                ? sprintf('Your expense #%d ("%s" — ₱%s) was approved.', $expense->id, $expense->description, number_format((float) $expense->expense_amount, 2))
                : sprintf('Your expense #%d ("%s" — ₱%s) was rejected. Reason: %s', $expense->id, $expense->description, number_format((float) $expense->expense_amount, 2), $reason),
            'type'    => $approved ? 'Success' : 'Warning',
            'is_read' => false,
        ]);
    }

    /**
     * Posts Debit Expense / Credit Cash Account for the approved expense.
     * Deducts the expense amount from the selected CashAccount's current_balance.
     */
    private function postJournalEntry(Expense $expense, User $approver): void
    {
        // ── Debit: pick the most specific Expense account available ──────────
        $categoryName = $expense->category?->category_name; // e.g. 'Utilities'

        // Try to match by name fragment first (e.g. 'Utilities' hits '5400 Utilities Expense')
        $debitAccount = $categoryName
            ? ChartOfAccount::where('account_type', 'Expense')
                ->where('account_name', 'like', "%{$categoryName}%")
                ->first()
            : null;

        // Fall back to the first Expense-type account (mirrors AP pattern)
        $debitAccount ??= ChartOfAccount::where('account_type', 'Expense')->first();

        if (! $debitAccount) {
            throw new \RuntimeException(
                "Expense #{$expense->id} cannot be approved: no Expense account exists in the Chart of Accounts. Seed ChartOfAccountSeeder first."
            );
        }

        // ── Credit: Selected CashAccount or fallback ─────────────────────────
        $cashAccount = $expense->cash_account_id ? CashAccount::lockForUpdate()->find($expense->cash_account_id) : null;
        $creditAccount = null;

        if ($cashAccount) {
            if ($expense->expense_amount > $cashAccount->current_balance) {
                throw ValidationException::withMessages([
                    'expense_amount' => sprintf(
                        'Approving this expense would overdraw the selected cash account "%s" (Available balance: ₱%s, Expense: ₱%s).',
                        $cashAccount->account_name,
                        number_format($cashAccount->current_balance, 2),
                        number_format((float) $expense->expense_amount, 2)
                    ),
                ]);
            }

            // Deduct the balance from the cash account
            $cashAccount->update([
                'current_balance' => $cashAccount->current_balance - $expense->expense_amount,
            ]);

            // If the cash account links directly to a GL account, credit that account
            if ($cashAccount->chart_of_account_id) {
                $creditAccount = ChartOfAccount::find($cashAccount->chart_of_account_id);
            }
        }

        // Fallback credit account if no linked GL account found on the cash account
        $creditAccount ??= ChartOfAccount::where('account_code', '1000')->first()
            ?? ChartOfAccount::where('account_category', 'Current Asset')->first();

        if (! $creditAccount) {
            throw new \RuntimeException(
                "Expense #{$expense->id} cannot be approved: no Cash/Asset account exists in the Chart of Accounts. Seed ChartOfAccountSeeder first."
            );
        }

        // ── Post the double-entry ─────────────────────────────────────────────
        $entry = JournalEntry::create([
            'transaction_no'   => 'JE-EXP-' . $expense->id . '-' . now()->format('YmdHis'),
            'transaction_date' => $expense->expense_date,
            'description'      => "Approved expense #{$expense->id}: {$expense->description}" . ($cashAccount ? " (Paid from {$cashAccount->account_name})" : ''),
            'status'           => 'Posted',
            'posted_by'        => $approver->id,
            'posted_at'        => now(),
            'created_by'       => $approver->id,
        ]);

        $entry->lines()->createMany([
            [
                'account_id'     => $debitAccount->id,
                'debit'          => $expense->expense_amount,
                'credit'         => 0,
                'reference_type' => 'Expenses',
                'reference_id'   => $expense->id,
                'remarks'        => "Expense recognized ({$debitAccount->account_name})",
            ],
            [
                'account_id'     => $creditAccount->id,
                'debit'          => 0,
                'credit'         => $expense->expense_amount,
                'reference_type' => 'Expenses',
                'reference_id'   => $expense->id,
                'remarks'        => "Expense settled ({$creditAccount->account_name})" . ($cashAccount ? " [{$cashAccount->account_code}]" : ''),
            ],
        ]);
    }

    /**
     * Attach a receipt file to an expense, via the shared
     * supporting_documents table (reference_type = 'expense') — same
     * pattern as CollectionService::attachProof() / BudgetService's plan
     * upload. Re-uploading adds a new version rather than replacing the
     * previous one, so the full upload history is preserved.
     *
     * Unlike CollectionService::attachProof() (which only allows
     * Pending/Confirmed), no status restriction is applied here — a
     * receipt is pure documentation with no budget/ledger impact, so
     * there's no equivalent reason to lock it once an expense is
     * Approved or Rejected. Re-evaluate this if that assumption changes.
     *
     * Deliberately syncs receipt_status to Uploaded on a successful
     * attach — Expense::RECEIPT_UPLOADED exists specifically to mean
     * "a receipt file is on file for this expense", so leaving that
     * field manually out of sync with whether a file actually exists
     * would defeat its purpose. This bypasses UpdateExpenseRequest's
     * approved-expense lock intentionally: attaching documentation to
     * an already-approved expense doesn't touch budget_id, amount, or
     * anything ExpenseService::update() guards against.
     *
     * Storage path: expense-receipts/{expense_id}/{filename}
     */
    public function attachReceipt(Expense $expense, UploadedFile $file, User $actor): SupportingDocument
    {
        $path = $file->store("expense-receipts/{$expense->id}", 'local');

        $document = SupportingDocument::create([
            'reference_type' => 'expense',
            'reference_id' => $expense->id,
            'file_name' => basename($path),
            'original_name' => $file->getClientOriginalName(),
            'storage_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
            'uploaded_by' => $actor->id,
            'uploaded_at' => now(),
        ]);

        $expense->update(['receipt_status' => Expense::RECEIPT_UPLOADED]);

        AuditLog::create([
            'user_id' => $actor->id,
            'module' => 'Expenses',
            'action' => 'attach_receipt',
            'record_id' => $expense->id,
            'activity_description' => "Attached receipt \"{$file->getClientOriginalName()}\" to expense #{$expense->id}.",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $document;
    }

    /**
     * Return all receipt documents for an expense, newest first. The
     * first item in the list is the current/latest receipt. Mirrors
     * CollectionService::getProofHistory() exactly.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, SupportingDocument>
     */
    public function getReceiptHistory(Expense $expense): \Illuminate\Database\Eloquent\Collection
    {
        return SupportingDocument::query()
            ->with('uploader:id,first_name,last_name')
            ->where('reference_type', 'expense')
            ->where('reference_id', $expense->id)
            ->orderByDesc('uploaded_at')
            ->orderByDesc('id')
            ->get()
            ->map(function (SupportingDocument $doc) {
                $doc->uploaded_by_name = $doc->uploader
                    ? trim("{$doc->uploader->first_name} {$doc->uploader->last_name}")
                    : null;
                $doc->has_file = (bool) $doc->storage_path;
                return $doc;
            });
    }

    /**
     * The single most recently uploaded receipt, or null if none exist —
     * what the "current" (singular, /receipt/view) endpoint serves, as
     * opposed to getReceiptHistory()'s full list. Same ordering as the
     * history query's first row, just without loading everything else.
     */
    public function getCurrentReceipt(Expense $expense): ?SupportingDocument
    {
        return SupportingDocument::query()
            ->where('reference_type', 'expense')
            ->where('reference_id', $expense->id)
            ->orderByDesc('uploaded_at')
            ->orderByDesc('id')
            ->first();
    }
}