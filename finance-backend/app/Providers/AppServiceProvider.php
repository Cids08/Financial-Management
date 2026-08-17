<?php

namespace App\Providers;

use App\Contracts\AdvisorEngine;
use App\Contracts\ForecastEngine;
use App\Contracts\RecommendationEngine;
use App\Services\Advisor\OpenAiAdvisorEngine;
use App\Services\Forecasting\PythonArimaForecastEngine;
use App\Services\Recommendation\OpenAiRecommendationEngine;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Points at the Python ARIMA/FastAPI service. Endpoint paths/payload
        // shape in PythonArimaForecastEngine are still unverified against
        // the real FastAPI routes — holding off on further changes here
        // until that's connected and confirmed.
        $this->app->bind(ForecastEngine::class, PythonArimaForecastEngine::class);

        // Flipped to real OpenAI now that a key is available. Requires
        // OPENAI_API_KEY (and optionally OPENAI_ADVISOR_MODEL) in .env.
        // AiAdvisorService and SummarizeAiAdvisorConversation depend on the
        // AdvisorEngine interface only — neither needed to change.
        $this->app->bind(AdvisorEngine::class, OpenAiAdvisorEngine::class);

        // Same key, flipped to real OpenAI. Requires OPENAI_API_KEY (and
        // optionally OPENAI_RECOMMENDATION_MODEL) in .env.
        // GenerateAiRecommendations depends on the RecommendationEngine
        // interface only — it didn't need to change either.
        $this->app->bind(RecommendationEngine::class, OpenAiRecommendationEngine::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}