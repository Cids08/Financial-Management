<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AccountsReceivable;
use App\Models\Budget;
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
    /** Monthly collected revenue for the last $months, oldest first, zero-filled for empty months. */
    public function getRevenueTrend(int $months = 6): array
    {
        return $this->monthlySeries(CollectionModel::class, 'collection_date', 'amount_received', $months);
    }

    /** Monthly non-rejected expenses for the last $months, oldest first, zero-filled. */
    public function getExpenseTrend(int $months = 6): array
    {
        $start = Carbon::today()->subMonthsNoOverflow($months - 1)->startOfMonth();

        $rows = Expense::query()
            ->selectRaw("TO_CHAR(expense_date, 'YYYY-MM') as month, SUM(expense_amount) as total")
            ->where('expense_date', '>=', $start)
            ->where('status', '!=', Expense::STATUS_REJECTED)
            ->groupBy('month')
            ->pluck('total', 'month');

        return $this->zeroFillMonths($rows, $months);
    }

    /** Net cash flow (revenue - expenses) per month, derived from the two trends above. */
    public function getCashFlowTrend(int $months = 6): array
    {
        $revenue = collect($this->getRevenueTrend($months))->keyBy('label');
        $expense = collect($this->getExpenseTrend($months))->keyBy('label');

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

    /** Allocated vs. used amount per department, for currently-active budgets. */
    public function getBudgetUtilization(): array
    {
        $today = Carbon::today();

        return Budget::query()
            ->join('departments', 'departments.id', '=', 'budgets.department_id')
            ->whereDate('budgets.start_date', '<=', $today)
            ->whereDate('budgets.end_date', '>=', $today)
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

    /** All seven chart datasets in one call — mirrors the "one aggregated payload" pattern used for the rest of the dashboard. */
    public function getAll(): array
    {
        return [
            'revenue_trend' => $this->getRevenueTrend(),
            'expense_trend' => $this->getExpenseTrend(),
            'cash_flow_trend' => $this->getCashFlowTrend(),
            'collections_trend' => $this->getCollectionsTrend(),
            'budget_utilization' => $this->getBudgetUtilization(),
            'receivable_aging' => $this->getReceivableAging(),
            'payable_aging' => $this->getPayableAging(),
        ];
    }

    /**
     * Shared monthly-sum-with-gap-filling logic for any model with a date
     * column + an amount column (Collections today, easy to reuse for
     * anything else shaped the same way later).
     */
    private function monthlySeries(string $modelClass, string $dateColumn, string $amountColumn, int $months): array
    {
        $start = Carbon::today()->subMonthsNoOverflow($months - 1)->startOfMonth();

        $rows = $modelClass::query()
            ->selectRaw("TO_CHAR({$dateColumn}, 'YYYY-MM') as month, SUM({$amountColumn}) as total")
            ->where($dateColumn, '>=', $start)
            ->groupBy('month')
            ->pluck('total', 'month');

        return $this->zeroFillMonths($rows, $months);
    }

    /** @param \Illuminate\Support\Collection<string, mixed> $rows keyed by 'YYYY-MM' */
    private function zeroFillMonths($rows, int $months): array
    {
        $series = [];
        $cursor = Carbon::today()->subMonthsNoOverflow($months - 1)->startOfMonth();

        for ($i = 0; $i < $months; $i++) {
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