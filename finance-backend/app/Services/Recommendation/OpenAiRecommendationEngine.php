<?php

namespace App\Services\Recommendation;

use App\Contracts\RecommendationEngine;
use App\Models\FinancialForecast;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Real OpenAI-backed implementation. Not bound by default — see
 * AppServiceProvider, which currently binds RecommendationEngine to
 * MockRecommendationEngine (free, no API key required).
 *
 * Asks for STRICT JSON so the response can be parsed straight into
 * ai_recommendations rows without free-text parsing. Per the ai-forecasting
 * skill's "GPT Restrictions": never invents financial values — the prompt
 * only ever hands the model figures already computed by ARIMA, and asks it
 * to explain/contextualize them, not calculate new ones.
 */
class OpenAiRecommendationEngine implements RecommendationEngine
{
    public function generate(FinancialForecast $forecast): Collection
    {
        $payload = [
            'forecast_type' => $forecast->forecast_type,
            'forecast_period' => $forecast->forecast_period,
            'predicted_amount' => $forecast->predicted_amount,
            'confidence_score' => $forecast->confidence_score ?? null,
        ];

        $messages = [
            ['role' => 'system', 'content' => $this->systemPrompt()],
            ['role' => 'user', 'content' => json_encode($payload)],
        ];

        try {
            $response = Http::withToken(config('services.openai.key'))
                ->timeout(30)
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => config('services.openai.recommendation_model', 'gpt-4o-mini'),
                    'messages' => $messages,
                    'max_tokens' => 600,
                    'temperature' => 0.2,
                    'response_format' => ['type' => 'json_object'],
                ]);

            if ($response->failed()) {
                Log::error('OpenAI recommendation request failed', [
                    'forecast_id' => $forecast->getKey(),
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return collect();
            }

            $raw = $response->json('choices.0.message.content');
            $decoded = json_decode((string) $raw, true);

            if (! is_array($decoded) || ! isset($decoded['recommendations']) || ! is_array($decoded['recommendations'])) {
                Log::error('OpenAI recommendation response malformed', [
                    'forecast_id' => $forecast->getKey(),
                    'raw' => $raw,
                ]);

                return collect();
            }

            return collect($decoded['recommendations'])
                ->filter(fn ($r) => isset($r['type'], $r['summary'], $r['recommendation']))
                ->values();
        } catch (\Throwable $e) {
            Log::error('OpenAI recommendation request exception', [
                'forecast_id' => $forecast->getKey(),
                'error' => $e->getMessage(),
            ]);

            return collect();
        }
    }

    private function systemPrompt(): string
    {
        return "You are a financial analysis assistant for Alibaton Construction Inc.'s "
            . "Financial Management System. You will be given a single ARIMA forecast result as "
            . "JSON. Generate 1-2 recommendations based ONLY on the figures given — never invent "
            . "or estimate numbers not provided. Always communicate forecast uncertainty honestly; "
            . "never present the forecast as guaranteed. Avoid definitive financial advice "
            . "(e.g. never say 'you should invest more') — explain why, highlight supporting data, "
            . "and discuss possible risks instead.\n\n"
            . "Respond with STRICT JSON only, no markdown, no prose outside the JSON, in this exact shape:\n"
            . '{"recommendations": [{"type": "Cash Flow Management|Cost Reduction|Revenue Optimization|Risk Alert|Budget Adjustment", '
            . '"summary": "one sentence, under 200 chars", "recommendation": "2-4 sentences, full explanation"}]}';
    }
}