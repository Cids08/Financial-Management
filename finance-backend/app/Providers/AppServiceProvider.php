<?php

namespace App\Providers;

use App\Contracts\ForecastEngine;
use App\Services\Forecasting\MockForecastEngine;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // TODO: once finance-forecasting/ (the Python ARIMA service) is
        // ready, replace this binding with an HTTP-client implementation,
        // e.g. app/Services/Forecasting/PythonArimaForecastEngine.php.
        // Nothing else in the app needs to change — controller, service,
        // and resources all depend on the ForecastEngine interface, not
        // this concrete class.
        $this->app->bind(ForecastEngine::class, MockForecastEngine::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}