<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\TaxObligation;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TaxObligationService
{
    protected const PER_PAGE = 15;

    // Fixed system budget/category tax payments post against. One-time
    // reference data — seed a Budget with this budget_code and an
    // ExpenseCategory with this category_code before the first tax
    // obligation is marked Paid.
    protected const TAX_BUDGET_CODE = 'STAT-COMPLIANCE';
    protected const TAX_CATEGORY_CODE = 'TAX';

    // Fields captured in AuditLog.old_values/new_values for create/update —
    // the obligation's actual financial and status data, not timestamps or
    // relationship ids that don't need a diff trail.
    protected const AUDITED_FIELDS = [
        'tax_type', 'tax_period', 'tax_rate', 'taxable_amount', 'tax_amount',
        'due_date', 'payment_date', 'reference_number', 'status', 'remarks',
    ];

    public function __construct(private readonly ExpenseService $expenseService)
    {
    }

    /**
     * @param array{search?: string, status?: string, archived?: bool} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = TaxObligation::query()->with(['createdBy', 'deletedBy', 'expense']);

        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        $query->search($filters['search'] ?? null)->latest('due_date');

        // "Overdue" is derived (Pending + due_date < today) rather than a
        // stored value, but it's still expressible in SQL, so filter here —
        // before pagination — instead of on an already-paginated page.
        // Filtering post-fetch made `total`/`last_page` in the response
        // meta reflect the unfiltered count while `data` held fewer rows,
        // which breaks pagination controls on the frontend the moment a
        // status filter is applied. Trashed obligations are always 'Paid'
        // or 'Pending' in practice, but a Paid record is never reclassified
        // regardless of due_date (see TaxObligation::derivedStatus()), so
        // the same rule is mirrored here.
        match ($filters['status'] ?? null) {
            'Paid' => $query->where('status', 'Paid'),
            'Pending' => $query->where('status', 'Pending')
                ->where('due_date', '>=', now()->toDateString()),
            'Overdue' => $query->where('status', 'Pending')
                ->where('due_date', '<', now()->toDateString()),
            default => null,
        };

        return $query->paginate(self::PER_PAGE);
    }

    public function create(User $user, array $data): TaxObligation
    {
        return DB::transaction(function () use ($user, $data) {
            $isPaid = (bool) ($data['is_paid'] ?? false);

            $obligation = TaxObligation::create([
                ...$data,
                'tax_amount'       => $this->computeTaxAmount($data),
                'status'           => $isPaid ? 'Paid' : 'Pending',
                'payment_date'     => $isPaid ? ($data['payment_date'] ?? now()->toDateString()) : null,
                'reference_number' => $isPaid ? ($data['reference_number'] ?? null) : null,
                'created_by'       => $user->id,
            ]);

            if ($isPaid) {
                $obligation = $this->recordAsExpense($user, $obligation);
            }

            $this->logAudit($user, 'create', $obligation, null, $obligation->only(self::AUDITED_FIELDS));

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    public function update(User $user, TaxObligation $obligation, array $data): TaxObligation
    {
        return DB::transaction(function () use ($user, $obligation, $data) {
            $wasPaid = $obligation->status === 'Paid';
            $isPaid = (bool) ($data['is_paid'] ?? false);
            $oldValues = $obligation->only(self::AUDITED_FIELDS);

            // Once this obligation's payment has already been posted as an
            // approved Expense (with a GL entry and budget usage already
            // applied), it must be treated the same way ExpenseService::update()
            // treats an Approved expense: frozen. Two failure modes matter here:
            //
            //  1. Un-checking "paid" would silently orphan the linked Expense
            //     instead of reversing it.
            //  2. Changing tax_type/tax_period/tax_rate/taxable_amount/due_date
            //     would change tax_amount on this record without touching the
            //     Expense (or its journal entries / budget usage) that were
            //     already posted from the old amount — the two records would
            //     silently drift out of sync.
            //
            // Both are blocked below. Archive the obligation (or, if truly
            // needed, adjust the linked Expense itself) rather than editing a
            // posted obligation in place.
            if ($obligation->expense_id) {
                $recomputedAmount = $this->computeTaxAmount($data);

                $isLocked = ! $isPaid
                    || $obligation->tax_type !== $data['tax_type']
                    || $obligation->tax_period !== $data['tax_period']
                    || (float) $obligation->tax_rate !== (float) $data['tax_rate']
                    || (float) $obligation->taxable_amount !== (float) $data['taxable_amount']
                    || $obligation->due_date->toDateString() !== $data['due_date']
                    || (float) $obligation->tax_amount !== $recomputedAmount;

                if ($isLocked) {
                    throw ValidationException::withMessages([
                        'is_paid' => 'This obligation is already recorded as a paid, approved expense and cannot be edited. Archive the obligation instead, or adjust the linked expense directly if a correction is truly needed.',
                    ]);
                }
            }

            $obligation->update([
                ...$data,
                'tax_amount'       => $this->computeTaxAmount($data),
                'status'           => $isPaid ? 'Paid' : 'Pending',
                'payment_date'     => $isPaid ? ($data['payment_date'] ?? now()->toDateString()) : null,
                'reference_number' => $isPaid ? ($data['reference_number'] ?? null) : null,
            ]);

            if (! $wasPaid && $isPaid) {
                $obligation = $this->recordAsExpense($user, $obligation);
            }

            $this->logAudit($user, 'update', $obligation, $oldValues, $obligation->fresh()->only(self::AUDITED_FIELDS));

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    public function archive(User $user, TaxObligation $obligation): TaxObligation
    {
        return DB::transaction(function () use ($user, $obligation) {
            $obligation->update(['deleted_by' => $user->id]);
            $obligation->delete();

            $this->logAudit($user, 'archive', $obligation);

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    public function restore(User $user, int $id): TaxObligation
    {
        return DB::transaction(function () use ($user, $id) {
            // Lookup lives here rather than in the controller: it's the
            // same "find the record this action operates on" work the
            // service already does implicitly for archive() (via route
            // model binding) — restore() just needs onlyTrashed() first
            // since a soft-deleted record won't resolve through normal
            // implicit binding.
            $obligation = TaxObligation::onlyTrashed()->findOrFail($id);

            $obligation->restore();
            $obligation->update(['deleted_by' => null]);

            $this->logAudit($user, 'restore', $obligation);

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    protected function computeTaxAmount(array $data): float
    {
        $rate = (float) ($data['tax_rate'] ?? 0);
        $taxable = (float) ($data['taxable_amount'] ?? 0);

        return round($taxable * ($rate / 100), 2);
    }

    /**
     * Writes one AuditLog row for a tax obligation event. old/new values
     * are scoped to AUDITED_FIELDS — the obligation's actual financial and
     * status data — rather than the full attribute set, so the diff stored
     * is meaningful instead of noisy with timestamps/foreign keys.
     */
    protected function logAudit(
        User $user,
        string $action,
        TaxObligation $obligation,
        ?array $oldValues = null,
        ?array $newValues = null,
    ): void {
        AuditLog::create([
            'user_id'              => $user->id,
            'module'               => 'Tax Obligations',
            'action'               => $action,
            'record_id'            => $obligation->id,
            'activity_description' => ucfirst($action) . "d {$obligation->tax_type} obligation for {$obligation->tax_period}",
            'old_values'           => $oldValues,
            'new_values'           => $newValues,
            'ip_address'           => request()?->ip(),
            'user_agent'           => request()?->userAgent(),
        ]);
    }

    /**
     * Creates and approves the corresponding Expense the moment an
     * obligation is marked Paid, so it flows through the exact same
     * budget-deduction + GL-posting path as any other approved expense
     * (see ExpenseService::approve()). This isn't a workflow bypass: the
     * tax was already actually paid to BIR before this obligation is
     * marked Paid in the system, so "approve" here is recording a
     * transaction that's already settled in reality, not skipping review.
     *
     * Idempotent via expense_id — safe to call defensively; will not
     * create a second Expense if one is already linked.
     *
     * approve() is called with skipDepartmentCheck: true — this is a
     * system-generated compliance posting against the fixed
     * STAT-COMPLIANCE budget, not a user-filed expense. Whichever staff
     * member happened to mark the obligation Paid has no bearing on which
     * department statutory tax spend belongs to, so the normal
     * filer-department-must-match-budget-department rule doesn't apply
     * here. The budget-status check (STAT-COMPLIANCE must be Active) is
     * NOT skipped — that's still enforced.
     */
    protected function recordAsExpense(User $user, TaxObligation $obligation): TaxObligation
    {
        if ($obligation->expense_id) {
            return $obligation;
        }

        $budget = Budget::where('budget_code', self::TAX_BUDGET_CODE)->first();
        $category = ExpenseCategory::where('category_code', self::TAX_CATEGORY_CODE)->first();

        if (! $budget || ! $category) {
            throw ValidationException::withMessages([
                'finance' => "Tax obligation expense posting is not configured. Create a Budget with code '" . self::TAX_BUDGET_CODE . "' and an ExpenseCategory with code '" . self::TAX_CATEGORY_CODE . "'.",
            ]);
        }

        $expense = $this->expenseService->create([
            'budget_id' => $budget->id,
            'expense_category_id' => $category->id,
            'supplier_id' => null,
            'expense_date' => $obligation->payment_date,
            'description' => "{$obligation->tax_type} — {$obligation->tax_period} (BIR filing)",
            'expense_amount' => $obligation->tax_amount,
            'expense_source' => 'Statutory Tax Payment',
            'receipt_number' => $obligation->reference_number,
            'receipt_status' => Expense::RECEIPT_VERIFIED,
        ], $user);

        $expense = $this->expenseService->approve($expense, $user, skipDepartmentCheck: true);

        $obligation->update(['expense_id' => $expense->id]);

        return $obligation;
    }
}