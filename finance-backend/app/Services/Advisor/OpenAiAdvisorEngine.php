<?php

namespace App\Services\Advisor;

use App\Contracts\AdvisorEngine;
use App\Models\AiAdvisorConversation;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Chat-completions-backed implementation, bound by default in
 * AppServiceProvider. Points at whatever config('services.openai.base_url')
 * resolves to — currently OpenRouter (funded), not api.openai.com directly
 * (out of credits) — see the comment block in config/services.php for how
 * to switch back. Both expose the same /chat/completions request/response
 * shape, so this class needed zero changes to make that swap, only config.
 */
class OpenAiAdvisorEngine implements AdvisorEngine
{
    public function reply(
        AiAdvisorConversation $conversation,
        string $message,
        ?string $summary,
        Collection $recentMessages,
        Collection $groundingData,
    ): string {
        $messages = [
            ['role' => 'system', 'content' => $this->systemPrompt($summary, $groundingData)],
        ];

        foreach ($recentMessages as $m) {
            $messages[] = ['role' => $m->role, 'content' => $m->content];
        }

        $messages[] = ['role' => 'user', 'content' => $message];

        return $this->complete($messages, maxTokens: 400, temperature: 0.3)
            ?? 'Sorry, I could not generate a response right now.';
    }

    public function summarize(string $transcript): ?string
    {
        return $this->complete([
            [
                'role' => 'system',
                'content' => 'Summarize this financial-advisor chat in 3-4 factual sentences, '
                    . 'preserving any figures, recommendations, or decisions mentioned. '
                    . 'Do not add new information.',
            ],
            ['role' => 'user', 'content' => $transcript],
        ], maxTokens: 200, temperature: 0);
    }

    private function complete(array $messages, int $maxTokens, float $temperature): ?string
    {
        $baseUrl = rtrim(config('services.openai.base_url'), '/');

        try {
            $response = Http::withToken(config('services.openai.key'))
                ->withHeaders([
                    // Harmless no-ops on real OpenAI; OpenRouter uses these
                    // for attribution/rankings on their dashboard.
                    'HTTP-Referer' => config('services.openai.referer'),
                    'X-Title' => config('services.openai.title'),
                ])
                ->timeout(30)
                ->post($baseUrl . '/chat/completions', [
                    'model' => config('services.openai.advisor_model', 'openai/gpt-4o-mini'),
                    'messages' => $messages,
                    'max_tokens' => $maxTokens,
                    'temperature' => $temperature,
                ]);

            if ($response->failed()) {
                Log::error('OpenAI advisor request failed', [
                    'base_url' => $baseUrl,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return null;
            }

            return $response->json('choices.0.message.content');
        } catch (\Throwable $e) {
            Log::error('OpenAI advisor request exception', ['error' => $e->getMessage()]);

            return null;
        }
    }

    private function systemPrompt(?string $summary, Collection $groundingData): string
    {
        $prompt = "You are a financial advisor assistant for Alibaton Construction Inc.'s "
            . "Financial Management System. Only use the data provided below — never invent "
            . "figures, approve transactions, or guarantee outcomes. Always communicate "
            . "forecast uncertainty honestly. Keep responses concise and professional.\n\n"
            . 'Current AI recommendations and linked forecasts:' . "\n"
            . $groundingData->toJson();

        if ($summary) {
            $prompt .= "\n\nSummary of earlier conversation with this user:\n{$summary}";
        }

        return $prompt;
    }
}