<?php

namespace App\Services\Forecasting;

use App\Contracts\ForecastEngine;
use App\Services\FinancialForecastService;
use Illuminate\Http\Client\ConnectionException;
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

    public function __construct(
        // Shared by every engine so the fallback (SimpleForecastEngine)
        // and this Python engine train on the exact same history.
        protected HistoricalActuals $actuals,
        ?string $baseUrl = null
    ) {
        // No default fallback, matching config/services.php's own comment:
        // fail loudly if unconfigured, rather than silently guessing a URL
        // (a hardcoded guess here is exactly how the earlier port-8000
        // collision between this service and Laravel's own dev server
        // went unnoticed for as long as it did). The AppServiceProvider
        // binding only selects this engine when the URL IS configured, so
        // in practice this guard fires only if the config is removed
        // after the binding was decided.
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
        $horizon = FinancialForecastService::horizonFor($horizonKey);
        if ($horizon === null) {
            throw new RuntimeException("Unknown horizon key: {$horizonKey}");
        }

        $historicalData = $this->historicalActualsFor($forecastType);

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

        $horizon = FinancialForecastService::horizonFor($horizonKey)
            ?? throw new RuntimeException("Unknown horizon key: {$horizonKey}");
        $historicalData = $this->historicalActualsFor($forecastType);

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
     * Monthly totals for $forecastType, oldest first, via the shared
     * HistoricalActuals collector — the exact same data-driven training
     * window the SimpleForecastEngine fallback uses.
     */
    protected function historicalActualsFor(string $forecastType): array
    {
        return $this->actuals->forType($forecastType);
    }
}