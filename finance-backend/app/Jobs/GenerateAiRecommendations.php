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
 * rows. Runs on the queue since forecast generation must never block on it.
 *
 * IMPORTANT: ai_recommendations' real DB column is `category`, NOT
 * `recommendation_type` — confirmed against the actual schema via the
 * project's ERD. Earlier versions of this job used `recommendation_type`,
 * which doesn't exist as a column, causing every insert to throw a
 * QueryException regardless of whether the RecommendationEngine call
 * itself succeeded. `priority` and `confidence_score` are also NOT NULL
 * on this table and are now populated by both engines.
 *
 * Delegates content generation to whichever RecommendationEngine is bound
 * in AppServiceProvider — this job only handles orchestration and
 * persistence, using the engine's 'type' key mapped onto the `category`
 * column.
 *
 * Skips forecasts that already have recommendations attached.
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
                    'category' => $r['type'],
                    'priority' => $r['priority'],
                    'confidence_score' => $r['confidence_score'],
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