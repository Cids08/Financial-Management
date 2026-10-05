<?php

namespace Tests\Feature;

use App\Contracts\ForecastEngine;
use App\Services\Forecasting\PythonArimaForecastEngine;
use App\Services\Forecasting\ResilientForecastEngine;
use App\Services\Forecasting\SimpleForecastEngine;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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

    /**
     * The fallback path reads real training history through HistoricalActuals,
     * so this test needs its own schema.
     *
     * It used to pass only because another test in the same process happened
     * to create these tables first and the shared in-memory SQLite connection
     * carried them over. That is order-dependent: running this file on its
     * own failed with "no such table: expenses". The tables are created here
     * so the test stands alone regardless of what runs before it.
     */
    protected function setUp(): void
    {
        parent::setUp();

        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');

        // Column shapes mirror what HistoricalActuals actually queries. The
        // tables stay empty: min()/sum() returning null is the "no history yet"
        // case, and SimpleForecastEngine still produces a usable linear trend
        // from it, which is exactly the degradation this test pins down.
        $shape = [
            'expenses' => [['expense_date', 'date'], ['amount', 'decimal']],
            'collections' => [['collection_date', 'date'], ['amount_received', 'decimal']],
            'disbursements' => [['payment_date', 'date'], ['amount_paid', 'decimal']],
            'accounts_receivable' => [['invoice_date', 'date'], ['original_amount', 'decimal'], ['paid_amount', 'decimal']],
        ];

        foreach ($shape as $table => $columns) {
            if (Schema::hasTable($table)) {
                continue;
            }

            Schema::create($table, function (Blueprint $t) use ($columns) {
                $t->id();
                $t->string('status')->nullable();
                $t->boolean('is_archived')->default(false);
                foreach ($columns as [$name, $type]) {
                    $type === 'date' ? $t->date($name)->nullable() : $t->decimal($name, 15, 2)->default(0);
                }
                $t->softDeletes();
            });
        }
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