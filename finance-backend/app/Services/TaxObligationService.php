<?php

namespace App\Services;

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

        $paginated = $query->paginate(self::PER_PAGE);

        // Status filter (Pending/Overdue/Paid) has to run after fetching,
        // since "Overdue" doesn't exist as a stored value to filter on in
        // SQL — it's derived per-row. Given this table is small in
        // practice (finite tax filings per period), filtering post-fetch
        // on an already-paginated page is an acceptable trade-off here;
        // revisit with a computed DB column if this table grows large.
        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $paginated->setCollection(
                $paginated->getCollection()->filter(
                    fn (TaxObligation $o) => $o->derivedStatus() === $filters['status']
                )->values()
            );
        }

        return $paginated;
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

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    public function update(User $user, TaxObligation $obligation, array $data): TaxObligation
    {
        return DB::transaction(function () use ($user, $obligation, $data) {
            $wasPaid = $obligation->status === 'Paid';
            $isPaid = (bool) ($data['is_paid'] ?? false);

            // Mirrors ExpenseService::update()'s guard against editing an
            // Approved expense directly: once this obligation's payment has
            // already been posted as an approved Expense (with a GL entry
            // and budget usage), un-checking "paid" here would silently
            // orphan that expense instead of reversing it. Archive the
            // obligation (or, if truly needed, adjust the linked Expense
            // itself) rather than un-marking payment here.
            if ($wasPaid && $obligation->expense_id && ! $isPaid) {
                throw ValidationException::withMessages([
                    'is_paid' => 'This obligation is already recorded as a paid, approved expense. Archive the obligation instead of un-marking it as paid.',
                ]);
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

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    public function archive(User $user, TaxObligation $obligation): TaxObligation
    {
        return DB::transaction(function () use ($user, $obligation) {
            $obligation->update(['deleted_by' => $user->id]);
            $obligation->delete();

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    public function restore(User $user, TaxObligation $obligation): TaxObligation
    {
        return DB::transaction(function () use ($obligation) {
            $obligation->restore();
            $obligation->update(['deleted_by' => null]);

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

        $expense = $this->expenseService->approve($expense, $user);

        $obligation->update(['expense_id' => $expense->id]);

        return $obligation;
    }
}