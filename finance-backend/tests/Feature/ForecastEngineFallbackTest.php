<?php

namespace Tests\Feature;

use App\Contracts\ForecastEngine;
use App\Services\Forecasting\PythonArimaForecastEngine;
use App\Services\Forecasting\SimpleForecastEngine;
use Illuminate\Foundation\Testing\TestCase;

/**
 * The ForecastEngine binding must pick the right engine based on whether
 * FORECAST_SERVICE_URL is configured. Production has no Python service,
 * so the fallback PHP engine is what makes "Generate next month" work
 * there — this test locks that decision in.
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

        $this->assertInstanceOf(
            PythonArimaForecastEngine::class,
            $this->app->make(ForecastEngine::class)
        );
    }

    public function test_fallback_engine_when_service_url_is_missing(): void
    {
        $this->app->config->set('services.forecast_service.base_url', null);

        $this->assertInstanceOf(
            SimpleForecastEngine::class,
            $this->app->make(ForecastEngine::class)
        );
    }
}