<?php

namespace App\Contracts;

/**
 * Implementations generate a forecast for one (forecast_type, horizon) pair.
 * Laravel never runs ARIMA itself — per the ai-forecasting skill, the real
 * model lives in the separate Python service (finance-forecasting/) and
 * talks to Laravel over REST. Swap the binding in
 * AppServiceProvider::register() from MockForecastEngine to a
 * PythonArimaForecastEngine (HTTP client) once that service exists —
 * nothing else in the app (controller, service, resource) needs to change.
 */
interface ForecastEngine
{
    /**
     * @param string $forecastType One of FinancialForecastService::FORECAST_TYPES
     * @param string $horizonKey One of FinancialForecastService::HORIZONS keys
     * @return array{
     *   predicted_amount: float,
     *   confidence_level: float,
     *   mape: float|null,
     *   rmse: float|null,
     *   algorithm: string,
     *   model_version: string,
     *   converged: bool,
     * }
     */
    public function generate(string $forecastType, string $horizonKey): array;

    /**
     * Historical + predicted chart points for one forecast. Kept separate
     * from generate() so it can be recomputed on demand for the detail
     * view without re-running (or re-mocking) the whole forecast.
     *
     * @return list<array{label: string, historical: float|null, predicted: float|null}>
     */
    public function buildSeries(string $forecastType, string $horizonKey, float $predictedAmount): array;
}