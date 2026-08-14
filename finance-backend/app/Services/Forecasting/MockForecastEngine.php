<?php

namespace App\Services\Forecasting;

use App\Contracts\ForecastEngine;

/**
 * Placeholder implementation — ports the same synthetic logic
 * FinancialForecasting.jsx used to fake forecasts client-side
 * (AUTO_ENGINE_PARAMS / runAutoForecast / buildSeries), so the full
 * generate → persist → display flow works end-to-end before the real
 * Python/ARIMA service exists. Numbers here are NOT real forecasts —
 * replace this binding (see AppServiceProvider) with a client that calls
 * the actual statsmodels ARIMA service once it's built.
 */
class MockForecastEngine implements ForecastEngine
{
    protected const PARAMS = [
        'Cash Flow' => ['base' => 1650000, 'growth' => 0.019, 'volatility' => 14000],
        'Revenue' => ['base' => 2150000, 'growth' => 0.021, 'volatility' => 15000],
        'Collections' => ['base' => 460000, 'growth' => 0.013, 'volatility' => 9000],
        'Expenses' => ['base' => 590000, 'growth' => 0.014, 'volatility' => 8000],
        'Accounts Receivable' => ['base' => 900000, 'growth' => 0.010, 'volatility' => 13000],
    ];

    /**
     * months: length of the forecast horizon; lookbackMonths: training
     * window; predictedPoints: number of forecast points on the chart.
     */
    public const HORIZONS = [
        'next_month' => ['months' => 1, 'lookback_months' => 6, 'predicted_points' => 1],
        'next_quarter' => ['months' => 3, 'lookback_months' => 8, 'predicted_points' => 3],
        'next_fiscal_year' => ['months' => 12, 'lookback_months' => 24, 'predicted_points' => 4],
    ];

    public function generate(string $forecastType, string $horizonKey): array
    {
        $params = self::PARAMS[$forecastType] ?? self::PARAMS['Cash Flow'];
        $horizon = self::HORIZONS[$horizonKey] ?? self::HORIZONS['next_month'];

        $noise = 1 + (mt_rand(-500, 500) / 10000); // ±5%
        $growthFactor = (1 + $params['growth']) ** $horizon['lookback_months'];
        $predictedAmount = round($params['base'] * $growthFactor * $noise, 2);

        $horizonPenalty = $horizon['months'] <= 1 ? 0 : ($horizon['months'] <= 3 ? 6 : 16);
        $confidenceLevel = max(60, min(97, round(92 - $horizonPenalty - mt_rand(0, 600) / 100)));
        $mape = max(2, round((3 + $horizonPenalty * 0.6 + mt_rand(0, 300) / 100), 1));

        return [
            'predicted_amount' => $predictedAmount,
            'confidence_level' => $confidenceLevel,
            'mape' => $mape,
            'rmse' => null, // mock engine doesn't compute this; real service should
            'algorithm' => $this->pickArimaOrder(),
            'model_version' => '0.1-mock',
        ];
    }

    public function buildSeries(string $forecastType, string $horizonKey, float $predictedAmount): array
    {
        $params = self::PARAMS[$forecastType] ?? self::PARAMS['Cash Flow'];
        $horizon = self::HORIZONS[$horizonKey] ?? self::HORIZONS['next_month'];
        $months = min($horizon['lookback_months'], 10);

        $series = [];
        $value = $params['base'];
        for ($i = 0; $i < $months; $i++) {
            $value = $value * (1 + $params['growth']) + (sin($i * 1.3) * $params['volatility']);
            $series[] = ['label' => 'H' . ($i + 1), 'historical' => round($value), 'predicted' => null];
        }

        $lastHistorical = $series[count($series) - 1]['historical'];
        $series[count($series) - 1]['predicted'] = $lastHistorical;

        $step = ($predictedAmount - $lastHistorical) / $horizon['predicted_points'];
        for ($i = 1; $i <= $horizon['predicted_points']; $i++) {
            $series[] = ['label' => 'P' . $i, 'historical' => null, 'predicted' => round($lastHistorical + $step * $i)];
        }

        return $series;
    }

    protected function pickArimaOrder(): string
    {
        $p = random_int(0, 2);
        $d = random_int(1, 2);
        $q = random_int(0, 2);
        return "ARIMA({$p},{$d},{$q})";
    }
}