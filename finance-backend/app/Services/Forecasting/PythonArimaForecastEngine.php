<?php

namespace App\Services\Forecasting;

use App\Contracts\ForecastEngine;
use App\Services\FinancialForecastService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Calls the real Python ARIMA service (finance-forecasting/) over HTTP.
 * All 5 forecast_type values are implemented in historicalActualsFor()
 * below: Expenses, Accounts Receivable, Collections, Cash Flow, Budget
 * Utilization — matching the required 5 categories exactly (no Revenue,
 * no standalone Invoices category; invoices remain transactional data
 * feeding the Accounts Receivable reconstruction below). Status filters
 * (COLLECTION_CONFIRMED_STATUS, EXPENSE_APPROVED_STATUS,
 * DISBURSEMENT_RELEASED_STATUS, BUDGET_ACTIVE_STATUS) have all been
 * confirmed against the actual frontend workflow code (Collections.jsx,
 * Expenses.jsx, Disbursements.jsx, Budgets.jsx) — no longer guesses.
 *
 * generate() and buildSeries() are called back-to-back, on the same
 * injected instance, within FinancialForecastService::generate() (single
 * request, single object). $lastResponse exists so buildSeries() reuses
 * generate()'s ARIMA call instead of re-fetching historical data and
 * re-hitting the Python service a second time for the same forecast.
 * This class is NOT meant to be called standalone outside that pairing —
 * buildSeries() throws if called without a matching prior generate().
 */
class PythonArimaForecastEngine implements ForecastEngine
{
    protected string $baseUrl;

    /** Cache of the most recent generate() call, keyed so buildSeries()
     *  can confirm it's reusing the right response. Cleared after use. */
    protected ?array $lastResponse = null;
    protected ?string $lastForecastType = null;
    protected ?string $lastHorizonKey = null;

    // UNCONFIRMED status strings. These are my best guess from the
    // permission/action names in the routes (collections.confirm,
    // expenses.approve, disbursements approved_by/released_by) and from
    // journal_entries having posted_by/posted_at columns — verify each
    // against your actual seeded enum/status values before trusting the
    // aggregated numbers below.
    protected const COLLECTION_CONFIRMED_STATUS = 'Confirmed';
    protected const EXPENSE_APPROVED_STATUS = 'Approved';
    protected const DISBURSEMENT_RELEASED_STATUS = 'Released';

    // Confirmed via Budgets.jsx's own comment on the frontend:
    // "status is constrained at the DB level (budgets_status_check) to:
    // Draft, Active, Closed, Cancelled ... Active = approved & spendable."
    // Only Active budgets should count as real, approved capacity.
    protected const BUDGET_ACTIVE_STATUS = 'Active';

    public function __construct(?string $baseUrl = null)
    {
        // No default fallback, matching config/services.php's own comment:
        // fail loudly if unconfigured, rather than silently guessing a URL
        // (a hardcoded guess here is exactly how the earlier port-8000
        // collision between this service and Laravel's own dev server
        // went unnoticed for as long as it did).
        $this->baseUrl = $baseUrl ?? config('services.forecast_service.base_url');

        if (empty($this->baseUrl)) {
            throw new RuntimeException(
                'FORECAST_SERVICE_URL is not set. Add it to .env — see '
                . 'config/services.php (services.forecast_service.base_url).'
            );
        }
    }

    public function generate(string $forecastType, string $horizonKey): array
    {
        $horizon = FinancialForecastService::HORIZON_LABELS[$horizonKey] ?? null;
        if ($horizon === null) {
            throw new RuntimeException("Unknown horizon key: {$horizonKey}");
        }

        $historicalData = $this->historicalActualsFor($forecastType, $horizon['lookback_months']);

        try {
            $response = Http::baseUrl($this->baseUrl)
                ->timeout(30)
                ->post('/forecast/arima', [
                    'forecast_target' => $forecastType,
                    'forecast_period' => $horizon['months'],
                    'historical_data' => $historicalData,
                ]);
        } catch (ConnectionException $e) {
            // Thrown when no response is received at all (timeout, refused
            // connection, DNS failure) — distinct from $response->failed()
            // below, which only fires once an actual HTTP response (with a
            // 4xx/5xx status) comes back. Without this catch, a downed or
            // hung Python service surfaces as a bare, unhelpful 500 with a
            // raw cURL error message leaking to the frontend (visible only
            // because APP_DEBUG is on locally — production would show
            // nothing useful at all).
            Log::error('ARIMA service unreachable', [
                'forecast_type' => $forecastType,
                'horizon_key' => $horizonKey,
                'base_url' => $this->baseUrl,
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException(
                'The forecasting service is currently unreachable. Please try again shortly.'
            );
        }

        if ($response->failed()) {
            Log::error('ARIMA service request failed', [
                'forecast_type' => $forecastType,
                'horizon_key' => $horizonKey,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            throw new RuntimeException(
                "ARIMA service returned {$response->status()}: {$response->body()}"
            );
        }

        $body = $response->json();

        $this->lastResponse = $body;
        $this->lastForecastType = $forecastType;
        $this->lastHorizonKey = $horizonKey;

        return [
            'predicted_amount' => $body['predicted_amount'],
            'confidence_level' => $body['confidence_level'],
            'mape' => $body['mape'],
            'rmse' => $body['rmse'],
            'algorithm' => sprintf(
                '%s(%d,%d,%d)',
                $body['algorithm'],
                $body['arima_order']['p'],
                $body['arima_order']['d'],
                $body['arima_order']['q'],
            ),
            'model_version' => $body['model_version'],
            // Surfaces the Python service's optimizer-convergence signal.
            // Defaults true if an older service build omits the key, so
            // this stays backward compatible during a rolling deploy.
            'converged' => $body['converged'] ?? true,
        ];
    }

    public function buildSeries(string $forecastType, string $horizonKey, float $predictedAmount): array
    {
        if ($this->lastResponse === null
            || $this->lastForecastType !== $forecastType
            || $this->lastHorizonKey !== $horizonKey
        ) {
            throw new RuntimeException(
                'buildSeries() called without a matching prior generate() call in this request. '
                . 'This engine is only correct when both are called together, in that order, on '
                . 'the same instance — see class docblock.'
            );
        }

        $horizon = FinancialForecastService::HORIZON_LABELS[$horizonKey];
        $historicalData = $this->historicalActualsFor($forecastType, $horizon['lookback_months']);

        $series = [];
        foreach ($historicalData as $index => $value) {
            $series[] = [
                'label' => 'H' . ($index + 1),
                'historical' => round($value, 2),
                'predicted' => null,
            ];
        }

        if (! empty($series)) {
            $series[count($series) - 1]['predicted'] = $series[count($series) - 1]['historical'];
        }

        foreach ($this->lastResponse['forecasts'] as $point) {
            $series[] = [
                'label' => 'P' . $point['period'],
                'historical' => null,
                'predicted' => round($point['predicted_amount'], 2),
            ];
        }

        $this->lastResponse = null;
        $this->lastForecastType = null;
        $this->lastHorizonKey = null;

        return $series;
    }

    /**
     * Returns `lookbackMonths` monthly totals for $forecastType, oldest
     * first, as a plain list<float> — exactly `lookbackMonths` entries,
     * one per calendar month, including zeros for months with no
     * activity (ARIMA needs a fixed-length, evenly-spaced series; a
     * GROUP BY query would silently skip empty months and break that).
     */
    protected function historicalActualsFor(string $forecastType, int $lookbackMonths): array
    {
        $months = $this->monthBoundaries($lookbackMonths);

        return match ($forecastType) {
            'Collections' => $this->monthlyCollections($months),
            'Expenses' => $this->monthlyExpenses($months),
            'Cash Flow' => $this->monthlyCashFlow($months),
            // Same underlying data as before — outstanding AR balance
            // point-in-time reconstruction. Category name matches the
            // required spec exactly; invoices remain a data source here,
            // not their own forecast category.
            'Accounts Receivable' => $this->monthlyAccountsReceivableBalance($months),
            // NEW — see monthlyBudgetUtilization() docblock: a
            // reconstructed point-in-time snapshot, same technique as
            // monthlyAccountsReceivableBalance(), because
            // budgets.used_amount is a current-state column with no
            // historical monthly record. INFERRED design, not confirmed
            // against real data — verify before trusting in production.
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
     * snapshots — this reconstructs the flow directly from the two
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
     * This is a point-in-time reconstruction, not a simple monthly SUM —
     * accounts_receivable.remaining_balance only reflects TODAY's state,
     * not what the balance was historically. Cumulative sums up to each
     * month-end approximate what the balance would have been then,
     * assuming no invoice/collection edits after the fact.
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
     * 'Active' (approved & spendable — see BUDGET_ACTIVE_STATUS) whose
     * [start_date, end_date] period overlaps that month at all (started
     * on/before month-end, and either still open or ended on/after month
     * start). Draft (awaiting approval) and Cancelled budgets are
     * excluded — they don't represent real, approved spending capacity,
     * even if their date range happens to overlap.
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
     * budgets active that month — same point-in-time reconstruction
     * technique as monthlyAccountsReceivableBalance(), since
     * budgets.used_amount is a current-state running total with no
     * historical monthly snapshot. NOT the same as the existing
     * "Expenses" forecast_type, which reports incremental spend per
     * month across ALL budgets — this is cumulative and scoped to
     * budgets active in that specific month.
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