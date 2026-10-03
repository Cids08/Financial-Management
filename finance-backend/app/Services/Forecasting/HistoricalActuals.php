<?php

namespace App\Services\Forecasting;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Monthly historical actuals shared by every ForecastEngine implementation.
 *
 * The Python (ARIMA) engine and the PHP fallback engine must derive their
 * training windows from the SAME queries, or the two engines would forecast
 * different things. Each returns a fixed-length, evenly-spaced series — one
 * entry per calendar month, zeros included — because both ARIMA and the
 * fallback trend fit need a regular series (a GROUP BY would silently skip
 * empty months).
 *
 * Status filters are the confirmed workflow values (see the matching notes
 * in PythonArimaForecastEngine): collections 'Confirmed', expenses
 * 'Approved', disbursements 'Released', budgets 'Active'.
 */
class HistoricalActuals
{
    public const COLLECTION_CONFIRMED_STATUS = 'Confirmed';
    public const EXPENSE_APPROVED_STATUS = 'Approved';
    public const DISBURSEMENT_RELEASED_STATUS = 'Released';
    public const BUDGET_ACTIVE_STATUS = 'Active';

    /**
     * @return list<float> oldest first, exactly $lookbackMonths entries
     */
    public function forType(string $forecastType, int $lookbackMonths): array
    {
        $months = $this->monthBoundaries($lookbackMonths);

        return match ($forecastType) {
            'Collections' => $this->monthlyCollections($months),
            'Expenses' => $this->monthlyExpenses($months),
            'Cash Flow' => $this->monthlyCashFlow($months),
            // Point-in-time outstanding AR balance reconstruction — see
            // monthlyAccountsReceivableBalance().
            'Accounts Receivable' => $this->monthlyAccountsReceivableBalance($months),
            'Budget Utilization' => $this->monthlyBudgetUtilization($months),
            default => throw new RuntimeException("Unknown forecast_type: {$forecastType}"),
        };
    }

    /**
     * @return list<array{start: Carbon, end: Carbon}> oldest first
     */
    protected function monthBoundaries(int $lookbackMonths): array
    {
        $months = [];
        $cursor = Carbon::today()->subMonthsNoOverflow($lookbackMonths - 1)->startOfMonth();

        for ($i = 0; $i < $lookbackMonths; $i++) {
            $months[] = ['start' => $cursor->copy(), 'end' => $cursor->copy()->endOfMonth()];
            $cursor->addMonthNoOverflow();
        }

        return $months;
    }

    /** SUM(amount_received), confirmed collections only, per month. */
    protected function monthlyCollections(array $months): array
    {
        return array_map(
            fn (array $m) => (float) DB::table('collections')
                ->whereBetween('collection_date', [$m['start'], $m['end']])
                ->where('status', self::COLLECTION_CONFIRMED_STATUS)
                ->whereNull('deleted_at')
                ->sum('amount_received'),
            $months
        );
    }

    /** SUM(expense_amount), approved expenses only, per month. */
    protected function monthlyExpenses(array $months): array
    {
        return array_map(
            fn (array $m) => (float) DB::table('expenses')
                ->whereBetween('expense_date', [$m['start'], $m['end']])
                ->where('status', self::EXPENSE_APPROVED_STATUS)
                ->whereNull('deleted_at')
                ->sum('expense_amount'),
            $months
        );
    }

    /**
     * Net operating cash flow per month: confirmed collections in, minus
     * released disbursements out. Doesn't use cash_accounts.current_balance
     * since that's a live point-in-time figure with no historical monthly
     * snapshots — the flow is reconstructed directly from the two
     * transaction tables instead.
     */
    protected function monthlyCashFlow(array $months): array
    {
        $collectionsIn = $this->monthlyCollections($months);

        $disbursementsOut = array_map(
            fn (array $m) => (float) DB::table('disbursements')
                ->whereBetween('payment_date', [$m['start'], $m['end']])
                ->where('status', self::DISBURSEMENT_RELEASED_STATUS)
                ->whereNull('deleted_at')
                ->sum('amount_paid'),
            $months
        );

        return array_map(
            fn ($in, $out) => $in - $out,
            $collectionsIn,
            $disbursementsOut
        );
    }

    /**
     * Outstanding AR balance AS OF each month-end, reconstructed as:
     *   (invoices raised on/before that month-end)
     *   - (confirmed collections applied on/before that month-end)
     *
     * A point-in-time reconstruction, not a simple monthly SUM — the
     * accounts_receivable.remaining_balance column only reflects TODAY's
     * state. Cumulative sums up to each month-end approximate what the
     * balance would have been then, assuming no invoice/collection edits
     * after the fact.
     */
    protected function monthlyAccountsReceivableBalance(array $months): array
    {
        return array_map(function (array $m) {
            $invoicedToDate = (float) DB::table('accounts_receivable')
                ->where('invoice_date', '<=', $m['end'])
                ->where('is_archived', false)
                ->whereNull('deleted_at')
                ->sum('original_amount');

            $collectedToDate = (float) DB::table('collections')
                ->join('accounts_receivable', 'accounts_receivable.id', '=', 'collections.ar_id')
                ->where('collections.collection_date', '<=', $m['end'])
                ->where('collections.status', self::COLLECTION_CONFIRMED_STATUS)
                ->where('accounts_receivable.is_archived', false)
                ->whereNull('accounts_receivable.deleted_at')
                ->whereNull('collections.deleted_at')
                ->sum('collections.amount_received');

            return $invoicedToDate - $collectedToDate;
        }, $months);
    }

    /**
     * Budget IDs "active" as of a given month-end: budgets with status
     * 'Active' (approved & spendable) whose [start_date, end_date] period
     * overlaps that month at all (started on/before month-end, and either
     * still open or ended on/after month start). Draft and Cancelled are
     * excluded — they don't represent real, approved spending capacity.
     */
    protected function activeBudgetIdsAsOf(Carbon $monthStart, Carbon $monthEnd): \Illuminate\Support\Collection
    {
        return DB::table('budgets')
            ->where('status', self::BUDGET_ACTIVE_STATUS)
            ->where('start_date', '<=', $monthEnd)
            ->where('end_date', '>=', $monthStart)
            ->whereNull('deleted_at')
            ->pluck('id');
    }

    /**
     * Cumulative approved-expense spend, AS OF each month-end, against
     * budgets active that month — the same point-in-time reconstruction
     * technique as monthlyAccountsReceivableBalance(), since
     * budgets.used_amount is a current-state running total with no
     * historical monthly snapshot. NOT the same as the "Expenses"
     * forecast_type, which reports incremental spend per month across ALL
     * budgets — this is cumulative and scoped to budgets active in that
     * specific month.
     */
    protected function monthlyBudgetUtilization(array $months): array
    {
        return array_map(function (array $m) {
            $activeBudgetIds = $this->activeBudgetIdsAsOf($m['start'], $m['end']);

            return (float) DB::table('expenses')
                ->whereIn('budget_id', $activeBudgetIds)
                ->where('expense_date', '<=', $m['end'])
                ->where('status', self::EXPENSE_APPROVED_STATUS)
                ->whereNull('deleted_at')
                ->sum('expense_amount');
        }, $months);
    }
}