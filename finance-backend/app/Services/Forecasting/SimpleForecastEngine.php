<?php

namespace App\Services\Forecasting;

use App\Contracts\ForecastEngine;
use App\Services\FinancialForecastService;
use RuntimeException;

/**
 * PHP-only fallback forecast engine, picked automatically whenever
 * FORECAST_SERVICE_URL is not configured (e.g. currently in the HostForge
 * production env — no Python service is deployed, so the ARIMA engine has
 * no endpoint and Generate fails at the network layer instead of returning
 * a forecast).
 *
 * NOT a substitute for ARIMA. This is a deterministic, dependency-free
 * model so the Generate buttons actually produce a forecast:
 *
 *   1. Build the SAME training window as the Python engine via
 *      HistoricalActuals (one value per completed calendar month, from the
 *      first month with activity for the type, capped at 60).
 *   2. Fit a least-squares linear trend y = a + b*x over the window.
 *   3. Shrink the intercept toward the window mean so short or noisy
 *      histories can't extrapolate into absurd numbers (the trend weight
 *      grows with the amount of history available).
 *   4. Project a+b*x forward for `months` periods, floors at zero, and
 *      reports in-sample MAPE/RMSE + a confidence derived from residual
 *      scatter.
 *
 * Swap back to the Python engine by setting FORECAST_SERVICE_URL and
 * redeploying — see the AppServiceProvider binding.
 */
class SimpleForecastEngine implements ForecastEngine
{
    protected const MODEL_VERSION = 'php-linear-trend-1.0';

    /** Cache of the most recent generate() call, keyed so buildSeries()
     *  can confirm it's reusing the right response. Cleared after use. */
    protected ?array $lastResponse = null;
    protected ?string $lastForecastType = null;
    protected ?string $lastHorizonKey = null;

    public function __construct(
        // Shared by every engine so this fallback and the Python engine
        // train on the exact same history.
        protected HistoricalActuals $actuals
    ) {
    }

    public function generate(string $forecastType, string $horizonKey): array
    {
        $horizon = FinancialForecastService::horizonFor($horizonKey)
            ?? throw new RuntimeException("Unknown horizon key: {$horizonKey}");

        $history = $this->actuals->forType($forecastType);

        [$a, $b] = $this->fitTrend($history);
        $forecasts = $this->project($a, $b, count($history), $horizon['months']);

        // CONTRACT: predicted_amount is the TOTAL predicted across the whole
        // horizon (the sum of every projected period), matching
        // arima_service.py's "predicted_amount":
        //     round(float(np.sum(forecast_values)), 2)
        //
        // This used to return the LAST period only, which meant the same
        // database column held two different meanings depending on which engine
        // produced the row: ARIMA stored a 12-period total, this fallback stored
        // a single period. Same forecast_type/horizon could therefore read ~12x
        // apart depending on whether the Python service happened to be
        // reachable, and the UI's "Total Predicted Value" card (which sums this
        // column across rows) silently under-counted every fallback row.
        // Per-period values remain available in the `forecasts` array that
        // buildSeries() replays into the chart.
        $predicted = (float) array_sum(array_column($forecasts, 'predicted_amount'));

        [$mape, $rmse] = $this->fitQuality($history, $a, $b);
        $meanY = count($history) > 0 ? abs(array_sum($history)) / max(count($history), 1) : 0.0;
        $confidence = $meanY > 0.01
            ? round(max(40, min(90, 65 - ($rmse / $meanY) * 25)), 2)
            : 55.0;

        $this->lastResponse = [
            'forecasts' => $forecasts,
            'predicted_amount' => $predicted,
            'confidence_level' => $confidence,
            'mape' => $mape,
            'rmse' => $rmse,
        ];
        $this->lastForecastType = $forecastType;
        $this->lastHorizonKey = $horizonKey;

        return [
            'predicted_amount' => $predicted,
            'confidence_level' => $confidence,
            'mape' => $mape,
            'rmse' => $rmse,
            'algorithm' => sprintf('LinearTrend(a=%.2f,b=%.2f)', $a, $b),
            'model_version' => self::MODEL_VERSION,
            'converged' => true,
        ];
    }

    public function buildSeries(string $forecastType, string $horizonKey, float $predictedAmount): array
    {
        if ($this->lastResponse === null
            || $this->lastForecastType !== $forecastType
            || $this->lastHorizonKey !== $horizonKey
        ) {
            throw new RuntimeException(
                'buildSeries() called without a matching prior generate() call in this request.'
            );
        }

        $horizon = FinancialForecastService::horizonFor($horizonKey)
            ?? throw new RuntimeException("Unknown horizon key: {$horizonKey}");
        $history = $this->actuals->forType($forecastType);

        $series = [];
        foreach ($history as $index => $value) {
            $series[] = [
                'label' => 'H' . ($index + 1),
                'historical' => round((float) $value, 2),
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
                'predicted' => round((float) $point['predicted_amount'], 2),
            ];
        }

        $this->lastResponse = null;
        $this->lastForecastType = null;
        $this->lastHorizonKey = null;

        return $series;
    }

    /**
     * Least-squares fit of y = a + b*x over the training window, then the
     * intercept is blended toward the window mean. $b is the raw slope
     * (untouched) so the DIRECTION of the trend is preserved even when the
     * level is pulled toward the mean.
     *
     * @param list<float> $history
     * @return array{0: float, 1: float} [a, b]
     */
    protected function fitTrend(array $history): array
    {
        $n = count($history);
        if ($n === 0) {
            return [0.0, 0.0];
        }

        $meanX = ($n - 1) / 2;
        $meanY = array_sum($history) / $n;

        $denom = 0.0;
        $cov = 0.0;
        foreach ($history as $i => $y) {
            $denom += ($i - $meanX) * ($i - $meanX);
            $cov += ($i - $meanX) * ($y - $meanY);
        }

        $b = $denom > 0.0 ? $cov / $denom : 0.0;
        $aIntercept = $meanY - $b * $meanX;

        // Trend weight grows with history: 20% at 1 month up to 85%.
        $trendWeight = min(0.85, max(0.2, $n / 24.0));
        $a = (1 - $trendWeight) * $meanY + $trendWeight * $aIntercept;

        return [$a, $b];
    }

    /**
     * @return list<array{period: int, predicted_amount: float}>
     */
    protected function project(float $a, float $b, int $historyCount, int $months): array
    {
        $points = [];
        for ($period = 1; $period <= $months; $period++) {
            $points[] = [
                'period' => $period,
                'predicted_amount' => max(0.0, round($a + $b * ($historyCount - 1 + $period), 2)),
            ];
        }

        return $points;
    }

    /**
     * In-sample MAPE (% : null when no positive history) and RMSE against
     * the trend line.
     *
     * @param list<float> $history
     * @return array{0: float|null, 1: float|null}
     */
    protected function fitQuality(array $history, float $a, float $b): array
    {
        $n = count($history);
        if ($n === 0) {
            return [null, null];
        }

        $sse = 0.0;
        $apeSum = 0.0;
        $apeCount = 0;
        foreach ($history as $i => $y) {
            $fit = $a + $b * $i;
            $sse += ($y - $fit) ** 2;
            if ($y > 0) {
                $apeSum += abs(($y - $fit) / $y);
                $apeCount++;
            }
        }

        return [
            $apeCount > 0 ? round(($apeSum / $apeCount) * 100, 2) : null,
            round(sqrt($sse / $n), 2),
        ];
    }
}