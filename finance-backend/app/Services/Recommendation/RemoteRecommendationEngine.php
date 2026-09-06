<?php

namespace App\Services\Recommendation;

use App\Contracts\RecommendationEngine;
use App\Models\FinancialForecast;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Calls the same AI microservice RemoteAdvisorEngine uses (a separate
 * FastAPI app) instead of OpenRouter directly. Both this and the advisor
 * chat are grouped under one "AI service" boundary since they're both
 * LLM-reasoning-over-financial-data use cases sharing the same provider
 * and credentials — forecasting itself (ARIMA, no LLM) is a genuinely
 * different technology and stays its own separate service.
 */
class RemoteRecommendationEngine implements RecommendationEngine
{
    public function generate(FinancialForecast $forecast): Collection
    {
        $baseUrl = rtrim(config('services.ai_advisor.url'), '/');
        $token = config('services.ai_advisor.token');

        try {
            $response = Http::withHeaders(['X-Internal-Token' => $token])
                ->timeout(35)
                ->post($baseUrl . '/recommendations', [
                    'forecast_type' => $forecast->forecast_type,
                    // forecast_period is a raw integer (months in the
                    // horizon) in the DB — no lookup table for it (see
                    // Finance_ERD). It's written by
                    // FinancialForecastService::generate() from
                    // HORIZON_LABELS ('next_month' => 1, 'next_quarter' =>
                    // 3, 'next_fiscal_year' => 12), and the AI
                    // microservice's Pydantic schema wants that same string
                    // key back, not the int. This uses the label accessor
                    // on FinancialForecast, which derives from that same
                    // HORIZON_LABELS map, rather than the raw attribute.
                    // Sending the raw int here previously caused a 422:
                    // "forecast_period": Input should be a valid string.
                    'forecast_period' => $forecast->forecast_period_label,
                    'predicted_amount' => $forecast->predicted_amount,
                    'confidence_level' => $forecast->confidence_level ?? null,
                ]);

            if ($response->failed()) {
                Log::error('AI service recommendation request failed', [
                    'forecast_id' => $forecast->getKey(),
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return collect();
            }

            $recommendations = $response->json('recommendations', []);

            // The Python service already validates categories/priorities
            // against the same enum before returning, but this stays as a
            // second, cheap defensive layer on the Laravel side too — the
            // insert into ai_recommendations still shouldn't blindly trust
            // a network response.
            $validCategories = ['Revenue', 'Expense', 'Cash Flow', 'Budget'];
            $validPriorities = ['Low', 'Medium', 'High', 'Critical'];

            return collect($recommendations)
                ->filter(fn ($r) => isset($r['type'], $r['priority'], $r['confidence_score'], $r['summary'], $r['recommendation']))
                ->filter(fn ($r) => in_array($r['type'], $validCategories, true))
                ->filter(fn ($r) => in_array($r['priority'], $validPriorities, true))
                ->map(fn ($r) => [
                    'type' => $r['type'],
                    'priority' => $r['priority'],
                    'confidence_score' => (float) $r['confidence_score'],
                    'summary' => $r['summary'],
                    'recommendation' => $r['recommendation'],
                ])
                ->values();
        } catch (\Throwable $e) {
            Log::error('AI service recommendation request exception', [
                'forecast_id' => $forecast->getKey(),
                'error' => $e->getMessage(),
            ]);

            return collect();
        }
    }
}