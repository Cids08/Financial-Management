<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Budget;
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
            ->with(['budget:id,budget_name', 'category:id,category_name', 'supplier:id,supplier_name', 'creator:id,first_name,last_name'])
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

        $expense->loadMissing('creator');

        return DB::transaction(function () use ($expense, $approver, $skipDepartmentCheck) {
            /** @var Budget $budget */
            $budget = Budget::query()->lockForUpdate()->findOrFail($expense->budget_id);

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
            'title' => $approved ? 'Expense approved' : 'Expense rejected',
            'message' => $approved
                ? sprintf('Your expense #%d was approved.', $expense->id)
                : sprintf('Your expense #%d was rejected.%s', $expense->id, $reason ? " Reason: {$reason}" : ''),
            'type' => $approved ? 'Success' : 'Warning',
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