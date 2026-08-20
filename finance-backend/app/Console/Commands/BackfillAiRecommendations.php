<?php

namespace App\Console\Commands;

use App\Jobs\GenerateAiRecommendations;
use App\Models\AiRecommendation;
use App\Models\FinancialForecast;
use Illuminate\Console\Command;

/**
 * One-off backfill: dispatches GenerateAiRecommendations for every
 * FinancialForecast that has no ai_recommendations rows yet. Needed
 * because earlier forecast attempts ran while OpenAI had no credits —
 * the job completed "successfully" each time (no error), it just
 * produced zero recommendations and never retried on its own.
 *
 * Uses a plain whereNotIn subquery rather than a whereDoesntHave()
 * relationship, since FinancialForecast may not have a `recommendations()`
 * relation defined — this works regardless.
 *
 * Safe to run repeatedly: GenerateAiRecommendations::handle() already
 * skips any forecast that already has recommendations, so this only
 * ever fills genuine gaps.
 */
class BackfillAiRecommendations extends Command
{
    protected $signature = 'ai:backfill-recommendations';
    protected $description = 'Dispatch GenerateAiRecommendations for every forecast missing recommendations';

    public function handle(): int
    {
        $forecastIdsWithRecommendations = AiRecommendation::query()
            ->distinct()
            ->pluck('forecast_id');

        $forecasts = FinancialForecast::query()
            ->whereNotIn('id', $forecastIdsWithRecommendations)
            ->get();

        if ($forecasts->isEmpty()) {
            $this->info('Every forecast already has recommendations — nothing to backfill.');
            return self::SUCCESS;
        }

        $this->info("Dispatching GenerateAiRecommendations for {$forecasts->count()} forecast(s)...");

        foreach ($forecasts as $forecast) {
            GenerateAiRecommendations::dispatch($forecast, $forecast->generated_by);
            $this->line("  Queued: {$forecast->forecast_no} ({$forecast->forecast_type})");
        }

        $this->info('Done. Make sure `php artisan queue:work` is running to actually process these.');

        return self::SUCCESS;
    }
}