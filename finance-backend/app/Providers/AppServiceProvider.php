<?php

namespace App\Providers;

use App\Contracts\AdvisorEngine;
use App\Contracts\ForecastEngine;
use App\Contracts\RecommendationEngine;
use App\Services\Advisor\RemoteAdvisorEngine;
use App\Services\Forecasting\PythonArimaForecastEngine;
use App\Services\Recommendation\RemoteRecommendationEngine;
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

        // Points at the AI microservice (ai-advisor-service), not OpenAI
        // directly — that service owns the actual OpenRouter call.
        // Requires AI_ADVISOR_SERVICE_URL and AI_ADVISOR_SERVICE_TOKEN in
        // .env. AiAdvisorService and SummarizeAiAdvisorConversation depend
        // on the AdvisorEngine interface only — neither needed to change.
        $this->app->bind(AdvisorEngine::class, RemoteAdvisorEngine::class);

        // Same AI microservice, different endpoint (/recommendations).
        // Requires the same AI_ADVISOR_SERVICE_URL/TOKEN as above.
        // GenerateAiRecommendations depends on the RecommendationEngine
        // interface only — it didn't need to change either.
        $this->app->bind(RecommendationEngine::class, RemoteRecommendationEngine::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}