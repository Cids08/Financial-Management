<?php

namespace App\Services\Recommendation;

use App\Contracts\RecommendationEngine;
use App\Models\FinancialForecast;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Chat-completions-backed implementation. Now asks for priority and
 * confidence_score in addition to type/summary/recommendation — both are
 * NOT NULL columns on ai_recommendations that earlier prompts never
 * requested, which caused every successful API call to still fail at the
 * database insert step (see GenerateAiRecommendations).
 */
class OpenAiRecommendationEngine implements RecommendationEngine
{
    public function generate(FinancialForecast $forecast): Collection
    {
        $payload = [
            'forecast_type' => $forecast->forecast_type,
            'forecast_period' => $forecast->forecast_period,
            'predicted_amount' => $forecast->predicted_amount,
            'confidence_level' => $forecast->confidence_level ?? null,
        ];

        $messages = [
            ['role' => 'system', 'content' => $this->systemPrompt()],
            ['role' => 'user', 'content' => json_encode($payload)],
        ];

        $baseUrl = rtrim(config('services.openai.base_url'), '/');

        try {
            $response = Http::withToken(config('services.openai.key'))
                ->withHeaders([
                    'HTTP-Referer' => config('services.openai.referer'),
                    'X-Title' => config('services.openai.title'),
                ])
                ->timeout(30)
                ->post($baseUrl . '/chat/completions', [
                    'model' => config('services.openai.recommendation_model', 'openai/gpt-4o-mini'),
                    'messages' => $messages,
                    'max_tokens' => 600,
                    'temperature' => 0.2,
                    'response_format' => ['type' => 'json_object'],
                ]);

            if ($response->failed()) {
                Log::error('OpenAI recommendation request failed', [
                    'forecast_id' => $forecast->getKey(),
                    'base_url' => $baseUrl,
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
                ->filter(fn ($r) => isset($r['type'], $r['priority'], $r['confidence_score'], $r['summary'], $r['recommendation']))
                ->map(fn ($r) => [
                    'type' => $r['type'],
                    'priority' => $r['priority'],
                    'confidence_score' => (float) $r['confidence_score'],
                    'summary' => $r['summary'],
                    'recommendation' => $r['recommendation'],
                ])
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
            . '{"recommendations": [{'
            . '"type": "Cash Flow Management|Cost Reduction|Revenue Optimization|Risk Alert|Budget Adjustment", '
            . '"priority": "High|Medium|Low", '
            . '"confidence_score": 0-100 (your own confidence in this specific recommendation, as a number), '
            . '"summary": "one sentence, under 200 chars", '
            . '"recommendation": "2-4 sentences, full explanation"'
            . '}]}';
    }
}