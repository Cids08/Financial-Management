<?php

namespace App\Jobs;

use App\Contracts\RecommendationEngine;
use App\Models\AiRecommendation;
use App\Models\FinancialForecast;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Turns a completed FinancialForecast into one or more ai_recommendations
 * rows — this is the "??? " step between forecast generation and the
 * AI Recommendations feed on the frontend. Runs on the queue since forecast
 * generation must never block on it (per "Forecast generation can be
 * computationally expensive... do not block user requests unnecessarily").
 *
 * Delegates the actual content generation to whichever RecommendationEngine
 * is bound in AppServiceProvider (MockRecommendationEngine by default, or
 * OpenAiRecommendationEngine once billing is set up) — this job only
 * handles orchestration and persistence.
 *
 * Per "Never regenerate existing recommendations unless requested" (backend
 * skill): skips forecasts that already have recommendations attached.
 */
class GenerateAiRecommendations implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        private FinancialForecast $forecast,
        private ?int $requestedByUserId = null,
    ) {
    }

    public function handle(RecommendationEngine $engine): void
    {
        $alreadyExists = AiRecommendation::query()
            ->where('forecast_id', $this->forecast->getKey())
            ->exists();

        if ($alreadyExists) {
            return;
        }

        $recommendations = $engine->generate($this->forecast);

        if ($recommendations->isEmpty()) {
            Log::info('No AI recommendations generated for forecast', [
                'forecast_id' => $this->forecast->getKey(),
            ]);

            return;
        }

        DB::transaction(function () use ($recommendations) {
            foreach ($recommendations as $r) {
                AiRecommendation::create([
                    'forecast_id' => $this->forecast->getKey(),
                    'recommendation_type' => $r['type'],
                    'summary' => $r['summary'],
                    'recommendation' => $r['recommendation'],
                    // Null = system-generated; AiRecommendationResource should
                    // fall back to a label like "AI System" when generated_by
                    // is null, same way it already falls back to "User #{id}".
                    'generated_by' => $this->requestedByUserId,
                    'generated_at' => now(),
                ]);
            }
        });
    }
}