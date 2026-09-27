<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AccountsReceivable;
use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\Collection as CollectionModel; // aliased — see note in App\Models\Collection
use App\Models\Expense;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Powers the Dashboard's "Charts & Trends" section. Kept separate from
 * DashboardService (which handles the cards/lists above it) so neither
 * file grows unbounded — this one only ever deals in chart-shaped data
 * (arrays of {label, value} points), never single scalars.
 *
 * Same status-enum caution as DashboardService: aging buckets use
 * remaining_balance > 0 (a real, verified numeric column) to mean
 * "still outstanding" rather than guessing a status string.
 */
class DashboardChartService
{
    /** Monthly collected revenue for the selected year (defaults to this year), zero-filled for empty months. */
    public function getRevenueTrend(?int $year = null): array
    {
        $year ??= (int) Carbon::today()->year;

        $rows = CollectionModel::query()
            ->selectRaw("TO_CHAR(collection_date, 'YYYY-MM') as month, SUM(amount_received) as total")
            ->whereYear('collection_date', $year)
            ->groupBy('month')
            ->pluck('total', 'month');

        return $this->zeroFillYearMonths($rows, $year);
    }

    /** Monthly non-rejected expenses for the selected year, zero-filled for empty months. */
    public function getExpenseTrend(?int $year = null): array
    {
        $year ??= (int) Carbon::today()->year;

        $rows = Expense::query()
            ->selectRaw("TO_CHAR(expense_date, 'YYYY-MM') as month, SUM(expense_amount) as total")
            ->whereYear('expense_date', $year)
            ->where('status', '!=', Expense::STATUS_REJECTED)
            ->groupBy('month')
            ->pluck('total', 'month');

        return $this->zeroFillYearMonths($rows, $year);
    }

    /** Net cash flow (revenue - expenses) per month, derived from the two trends above. */
    public function getCashFlowTrend(?int $year = null): array
    {
        $revenue = collect($this->getRevenueTrend($year))->keyBy('label');
        $expense = collect($this->getExpenseTrend($year))->keyBy('label');

        return $revenue->map(function ($point, $label) use ($expense) {
            $inflow = (float) $point['value'];
            $outflow = (float) ($expense[$label]['value'] ?? 0);

            return [
                'label' => $label,
                'inflow' => $inflow,
                'outflow' => $outflow,
                'net' => $inflow - $outflow,
            ];
        })->values()->toArray();
    }

    /**
     * Where the Available Cash actually sits — one slice per active cash
     * account with a positive balance, largest first. Zero-balance accounts
     * are dropped so the donut doesn't draw empty slices. Mirrors
     * DashboardService::getModuleCards()' "Active" semantics.
     */
    public function getCashDistribution(): array
    {
        $accounts = CashAccount::query()
            ->where('status', 'Active')
            ->where('current_balance', '>', 0)
            ->orderByDesc('current_balance')
            ->get(['account_name', 'bank_name', 'current_balance']);

        return $accounts
            ->map(fn ($account) => [
                'label' => $account->bank_name ? "{$account->account_name} ({$account->bank_name})" : $account->account_name,
                'value' => (float) $account->current_balance,
            ])
            ->values()
            ->toArray();
    }

    /** Daily collected amount for the last $days, oldest first, zero-filled for empty days. */
    public function getCollectionsTrend(int $days = 30): array
    {
        $start = Carbon::today()->subDays($days - 1);

        $rows = CollectionModel::query()
            ->selectRaw("TO_CHAR(collection_date, 'YYYY-MM-DD') as day, SUM(amount_received) as total")
            ->where('collection_date', '>=', $start)
            ->groupBy('day')
            ->pluck('total', 'day');

        $series = [];
        for ($i = 0; $i < $days; $i++) {
            $date = $start->copy()->addDays($i);
            $key = $date->format('Y-m-d');
            $series[] = [
                'label' => $date->format('M j'),
                'value' => (float) ($rows[$key] ?? 0),
            ];
        }

        return $series;
    }

    /** Allocated vs. used amount per department, for currently-active, approved budgets in active departments. */
    public function getBudgetUtilization(): array
    {
        $today = Carbon::today();

        return Budget::query()
            ->join('departments', 'departments.id', '=', 'budgets.department_id')
            ->whereDate('budgets.start_date', '<=', $today)
            ->whereDate('budgets.end_date', '>=', $today)
            ->whereNotNull('budgets.approved_by')
            ->where('departments.is_active', true)
            ->groupBy('departments.id', 'departments.department_name')
            ->orderBy('departments.department_name')
            ->selectRaw('departments.department_name as label, SUM(budgets.allocated_amount) as allocated, SUM(budgets.used_amount) as used')
            ->get()
            ->map(fn ($row) => [
                'label' => $row->label,
                'allocated' => (float) $row->allocated,
                'used' => (float) $row->used,
                'remaining' => max(0, (float) $row->allocated - (float) $row->used),
            ])
            ->toArray();
    }

    /** Outstanding AR grouped into 0-30 / 31-60 / 61-90 / 90+ day buckets by due date. */
    public function getReceivableAging(): array
    {
        return $this->agingBuckets(AccountsReceivable::class);
    }

    /** Outstanding AP grouped into 0-30 / 31-60 / 61-90 / 90+ day buckets by due date. */
    public function getPayableAging(): array
    {
        return $this->agingBuckets(AccountsPayable::class);
    }

    /**
     * Current year's non-rejected expenses grouped by category, largest
     * first  —  a composition (donut) slice per category. Expenses without a
     * category fall into an "Uncategorized" slice so the total still adds
     * up to the year's expense figure instead of silently missing chunks.
     */
    public function getExpenseBreakdown(?int $year = null): array
    {
        $year ??= (int) Carbon::today()->year;

        $rows = Expense::query()
            ->selectRaw("COALESCE(expense_categories.category_name, 'Uncategorized') as category, SUM(expenses.expense_amount) as total")
            ->leftJoin('expense_categories', 'expense_categories.id', '=', 'expenses.expense_category_id')
            ->where('expenses.status', '!=', Expense::STATUS_REJECTED)
            ->whereYear('expenses.expense_date', $year)
            ->groupBy('category')
            ->orderByDesc('total')
            ->pluck('total', 'category');

        return $rows
            ->map(fn ($total, $category) => ['label' => $category, 'value' => (float) $total])
            ->values()
            ->toArray();
    }

    /**
     * All eight chart datasets in one call  —  mirrors the "one aggregated payload" pattern used for the rest of the dashboard.
     *
     * $year only reaches the period-scoped series (revenue/expense/cash flow/
     * expense breakdown). The point-in-time ones  —  cash distribution, budget
     * utilization, AR/AP aging  —  and the rolling 30-day collections trend
     * have no meaningful "selected year" version, so they stay as-is.
     */
    public function getAll(?int $year = null): array
    {
        return [
            'revenue_trend' => $this->getRevenueTrend($year),
            'expense_trend' => $this->getExpenseTrend($year),
            'cash_flow_trend' => $this->getCashFlowTrend($year),
            'collections_trend' => $this->getCollectionsTrend(),
            'budget_utilization' => $this->getBudgetUtilization(),
            'receivable_aging' => $this->getReceivableAging(),
            'payable_aging' => $this->getPayableAging(),
            'expense_breakdown' => $this->getExpenseBreakdown($year),
            'cash_distribution' => $this->getCashDistribution(),
        ];
    }

    /**
     * Same gap-filling shape as zeroFillMonths, but anchored to Jan 1 of
     * $year and always emitting all 12 months — that's what "this year"
     * means on the Dashboard trends (Jan..Dec on the X axis, with the
     * not-yet-reached months legitimately sitting at 0).
     *
     * @param \Illuminate\Support\Collection<string, mixed> $rows keyed by 'YYYY-MM'
     */
    private function zeroFillYearMonths($rows, int $year): array
    {
        $series = [];
        $cursor = Carbon::create($year, 1, 1);

        for ($i = 0; $i < 12; $i++) {
            $key = $cursor->format('Y-m');
            $series[] = [
                'label' => $cursor->format('M Y'),
                'value' => (float) ($rows[$key] ?? 0),
            ];
            $cursor->addMonthNoOverflow();
        }

        return $series;
    }

    /**
     * remaining_balance > 0 means "still outstanding" — a real numeric
     * column, not a guessed status string. Bucketed by (today - due_date)
     * in whole days via Postgres date subtraction.
     */
    private function agingBuckets(string $modelClass): array
    {
        $rows = $modelClass::query()
            ->where('remaining_balance', '>', 0)
            ->selectRaw('(CURRENT_DATE - due_date) as days_overdue, remaining_balance')
            ->get();

        $buckets = [
            '0-30' => 0.0,
            '31-60' => 0.0,
            '61-90' => 0.0,
            '90+' => 0.0,
        ];

        foreach ($rows as $row) {
            $days = (int) $row->days_overdue;
            $amount = (float) $row->remaining_balance;

            $key = match (true) {
                $days <= 30 => '0-30',
                $days <= 60 => '31-60',
                $days <= 90 => '61-90',
                default => '90+',
            };

            $buckets[$key] += $amount;
        }

        return collect($buckets)
            ->map(fn ($value, $label) => ['label' => $label, 'value' => round($value, 2)])
            ->values()
            ->toArray();
    }
}