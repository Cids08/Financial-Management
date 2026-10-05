<?php

namespace Tests\Feature;

use App\Contracts\ForecastEngine;
use App\Services\Forecasting\PythonArimaForecastEngine;
use App\Services\Forecasting\ResilientForecastEngine;
use App\Services\Forecasting\SimpleForecastEngine;
use Illuminate\Foundation\Testing\TestCase;
use RuntimeException;

/**
 * Locks in how the ForecastEngine binding resolves, in all three cases:
 *
 *  1. No FORECAST_SERVICE_URL      -> SimpleForecastEngine directly.
 *  2. URL configured               -> ResilientForecastEngine wrapping ARIMA
 *                                     as the primary engine.
 *  3. ARIMA unreachable at runtime -> silently degrades to the linear-trend
 *     model instead of throwing.
 *
 * Case 3 is the one that mattered in production: FORECAST_SERVICE_URL *was*
 * set, the Python service was unreachable, and the resulting unhandled
 * exception produced a 500 rendered outside Laravel's HandleCors middleware.
 * With no Access-Control-Allow-Origin header, Chrome reported a CORS policy
 * failure and fetch() surfaced "Failed to fetch" — hiding the real cause (an
 * upstream cURL timeout) from the UI entirely.
 */
class ForecastEngineFallbackTest extends TestCase
{
    public function createApplication()
    {
        $app = require __DIR__.'/../../bootstrap/app.php';
        $app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
        return $app;
    }

    public function test_python_engine_when_service_url_is_configured(): void
    {
        $this->app->config->set('services.forecast_service.base_url', 'http://forecasting:8001');

        $engine = $this->app->make(ForecastEngine::class);

        // Wrapped, not bare: a configured-but-dead service must still be able
        // to fall back at runtime. ARIMA stays the primary so it resumes
        // automatically once the service recovers — no .env edit, no redeploy.
        $this->assertInstanceOf(ResilientForecastEngine::class, $engine);

        $primary = (fn () => $this->primary)->call($engine);

        $this->assertInstanceOf(PythonArimaForecastEngine::class, $primary);
    }

    public function test_fallback_engine_when_service_url_is_missing(): void
    {
        $this->app->config->set('services.forecast_service.base_url', null);

        // No service to be resilient about, so the plain engine is bound
        // directly and nothing wraps it.
        $this->assertInstanceOf(
            SimpleForecastEngine::class,
            $this->app->make(ForecastEngine::class)
        );
    }

    public function test_degrades_to_linear_trend_when_primary_engine_throws(): void
    {
        $primary = new class implements ForecastEngine
        {
            public function generate(string $forecastType, string $horizonKey): array
            {
                throw new RuntimeException('The forecasting service is currently unreachable.');
            }

            public function buildSeries(string $forecastType, string $horizonKey, float $predictedAmount): array
            {
                throw new RuntimeException('should never be reached');
            }
        };

        $engine = new ResilientForecastEngine(
            $primary,
            new SimpleForecastEngine($this->app->make(\App\Services\Forecasting\HistoricalActuals::class))
        );

        // Must NOT rethrow — the whole point is that a dead ARIMA service
        // degrades the model instead of failing the Generate request.
        $result = $engine->generate('Expenses', 'next_month');

        $this->assertArrayHasKey('predicted_amount', $result);
        $this->assertNotSame('', $result['algorithm']);

        // buildSeries() must be served by whichever engine actually produced
        // the last generate() — SimpleForecastEngine throws unless it sees
        // its own matching in-memory generate() state.
        $series = $engine->buildSeries('Expenses', 'next_month', $result['predicted_amount']);

        $this->assertNotEmpty($series);
        $this->assertSame('H1', $series[0]['label']);
    }

    public function test_primary_is_used_when_it_succeeds(): void
    {
        $primary = new class implements ForecastEngine
        {
            public function generate(string $forecastType, string $horizonKey): array
            {
                return [
                    'predicted_amount' => 1234.0,
                    'confidence_level' => 80.0,
                    'mape' => 5.0,
                    'rmse' => 10.0,
                    'algorithm' => 'ARIMA(1,1,0)',
                    'model_version' => 'test',
                    'converged' => true,
                ];
            }

            public function buildSeries(string $forecastType, string $horizonKey, float $predictedAmount): array
            {
                return [['label' => 'H1', 'historical' => 100.0, 'predicted' => null]];
            }
        };

        $fallback = new class implements ForecastEngine
        {
            public function generate(string $forecastType, string $horizonKey): array
            {
                throw new RuntimeException('fallback must not run when primary succeeds');
            }

            public function buildSeries(string $forecastType, string $horizonKey, float $predictedAmount): array
            {
                throw new RuntimeException('fallback must not run when primary succeeds');
            }
        };

        $engine = new ResilientForecastEngine($primary, $fallback);

        $this->assertSame('ARIMA(1,1,0)', $engine->generate('Expenses', 'next_month')['algorithm']);
        $this->assertSame('H1', $engine->buildSeries('Expenses', 'next_month', 1234.0)[0]['label']);
    }
}