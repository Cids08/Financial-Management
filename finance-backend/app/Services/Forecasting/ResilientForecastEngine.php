<?php

namespace App\Services\Forecasting;

use App\Contracts\ForecastEngine;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Wraps the remote ARIMA engine so a downed/unreachable forecasting service
 * degrades to the PHP linear-trend model instead of failing the request.
 *
 * Why this exists: AppServiceProvider only falls back to SimpleForecastEngine
 * when FORECAST_SERVICE_URL is *unset*. Once the variable IS set — which
 * production does — a hung Python service used to take Generate down with a
 * 30s cURL timeout and an unhandled RuntimeException. That surfaced to the
 * browser as a bare 500 rendered outside HandleCors, i.e. with no
 * Access-Control-Allow-Origin header, which Chrome reports as a CORS failure
 * and fetch() surfaces as "Failed to fetch". The real cause (upstream
 * timeout) was invisible from the UI.
 *
 * With this decorator the forecast still generates — just from the simpler
 * model — so the page keeps working while the service is down, and ARIMA
 * resumes automatically once it recovers (no redeploy or .env edit needed).
 *
 * The fallback is per-request and stateless: whichever engine produced the
 * last generate() is the one buildSeries() must use, because
 * SimpleForecastEngine::buildSeries() intentionally throws unless it can see
 * the matching in-memory generate() state on its own instance.
 */
class ResilientForecastEngine implements ForecastEngine
{
    protected bool $usedFallback = false;

    public function __construct(
        protected ForecastEngine $primary,
        protected ForecastEngine $fallback,
    ) {
    }

    public function generate(string $forecastType, string $horizonKey): array
    {
        try {
            $result = $this->primary->generate($forecastType, $horizonKey);
            $this->usedFallback = false;

            return $result;
        } catch (Throwable $e) {
            // Logged at warning, not error: this is an expected degradation
            // path, not an application fault. The primary engine has already
            // logged the underlying transport/HTTP detail.
            Log::warning('Forecast engine falling back to linear trend', [
                'forecast_type' => $forecastType,
                'horizon_key' => $horizonKey,
                'reason' => $e->getMessage(),
            ]);

            $this->usedFallback = true;

            return $this->fallback->generate($forecastType, $horizonKey);
        }
    }

    public function buildSeries(string $forecastType, string $horizonKey, float $predictedAmount): array
    {
        return ($this->usedFallback ? $this->fallback : $this->primary)
            ->buildSeries($forecastType, $horizonKey, $predictedAmount);
    }
}