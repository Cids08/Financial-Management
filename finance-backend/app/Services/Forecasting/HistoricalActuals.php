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

    // Ceiling for the training window. Below this, the window is data-driven:
    // every completed month from the first month with recorded activity for
    // that forecast type up to the last completed month. Once a company has
    // more history than this, only the most recent MAX_LOOKBACK_MONTHS are
    // used (5 years of monthly points is plenty — longer series slow the fit
    // without adding signal, and very old months often reflect a structurally
    // different business).
    public const MAX_LOOKBACK_MONTHS = 60;

    /**
     * @return list<float> oldest first, one entry per month in the window
     */
    public function forType(string $forecastType, int $maxLookbackMonths = self::MAX_LOOKBACK_MONTHS): array
    {
        $months = $this->monthBoundaries($forecastType, $maxLookbackMonths);

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
     * The [start, end] date range the training window actually covers —
     * the same boundaries monthBoundaries() builds, exposed so callers
     * (e.g. FinancialForecastService) can store historical_start/end to
     * match the data the model genuinely trained on.
     */
    public function window(string $forecastType, int $maxLookbackMonths = self::MAX_LOOKBACK_MONTHS): array
    {
        $months = $this->monthBoundaries($forecastType, $maxLookbackMonths);
        $first = $months[0];
        $last = $months[count($months) - 1];

        return ['start' => $first['start'], 'end' => $last['end']];
    }

    /**
     * @return list<array{start: Carbon, end: Carbon}> oldest first
     *
     * The window covers COMPLETED calendar months only — the current
     * in-progress month is excluded because its near-zero totals distort
     * both the holdout step that MAPE/RMSE are scored on (MAPE is undefined
     * when any actual is 0) and the trend/ARIMA fit itself, which can pull
     * projections negative. Forecast periods therefore start with the next
     * (current) month.
     *
     * The window length is data-driven: from the first month with recorded
     * activity for the forecast type through the last completed month,
     * bounded to at least 6 (ARIMA's minimum) and at most
     * self::MAX_LOOKBACK_MONTHS. This replaces the old "2x horizon" rule,
     * which starved long horizons of history on young companies while
     * trimming useful history for short ones.
     */
    protected function monthBoundaries(string $forecastType, int $maxLookbackMonths): array
    {
        $end = Carbon::today()->startOfMonth()->subMonthNoOverflow()->startOfMonth();
        $endBoundary = ['start' => $end->copy(), 'end' => $end->copy()->endOfMonth()];

        $firstActive = $this->firstActiveMonth($forecastType);
        if ($firstActive === null || $firstActive->startOfMonth()->gt($end)) {
            $count = 6;
        } else {
            $monthsSince = (int) $firstActive->startOfMonth()->diffInMonths($end);
            $count = min($maxLookbackMonths, max(6, $monthsSince + 1));
        }

        $months = [];
        $cursor = $endBoundary['start']->copy()->subMonthsNoOverflow($count - 1)->startOfMonth();
        foreach (range(1, $count) as $_) {
            $months[] = ['start' => $cursor->copy(), 'end' => $cursor->copy()->endOfMonth()];
            $cursor->addMonthNoOverflow();
        }

        return $months;
    }

    /**
     * First calendar month with recorded activity for the given forecast
     * type (or null if the type has no activity yet). Each type answers
     * from its own source table with the same status/filter semantics as
     * its monthly aggregate, so the window is what actually influenced the
     * series being forecast.
     */
    protected function firstActiveMonth(string $forecastType): ?Carbon
    {
        $date = match ($forecastType) {
            'Collections' => DB::table('collections')
                ->where('status', self::COLLECTION_CONFIRMED_STATUS)
                ->whereNull('deleted_at')
                ->min('collection_date'),
            'Expenses' => DB::table('expenses')
                ->where('status', self::EXPENSE_APPROVED_STATUS)
                ->whereNull('deleted_at')
                ->min('expense_date'),
            'Cash Flow' => [
                DB::table('collections')
                    ->where('status', self::COLLECTION_CONFIRMED_STATUS)
                    ->whereNull('deleted_at')
                    ->min('collection_date'),
                DB::table('disbursements')
                    ->where('status', self::DISBURSEMENT_RELEASED_STATUS)
                    ->whereNull('deleted_at')
                    ->min('payment_date'),
            ],
            'Accounts Receivable' => DB::table('accounts_receivable')
                ->where('is_archived', false)
                ->whereNull('deleted_at')
                ->min('invoice_date'),
            'Budget Utilization' => DB::table('expenses')
                ->where('status', self::EXPENSE_APPROVED_STATUS)
                ->whereNull('deleted_at')
                ->min('expense_date'),
            default => throw new RuntimeException("Unknown forecast_type: {$forecastType}"),
        };

        if (is_array($date)) {
            $date = array_filter($date, static fn ($d) => $d !== null);
            if ($date === []) {
                return null;
            }
            $date = min($date);
        }

        if (! $date) {
            return null;
        }

        return Carbon::parse($date)->startOfMonth();
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