<?php

namespace App\Services\Advisor;

use App\Contracts\AdvisorEngine;
use App\Models\AiAdvisorConversation;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Calls the AI Advisor microservice (a separate FastAPI app) instead of
 * OpenRouter directly. All the prompt construction, the actual OpenRouter
 * call, and post-processing (em-dash stripping) now live in that service —
 * see the microservice's main.py for the ported logic, which was moved
 * verbatim out of the old OpenAiAdvisorEngine.
 *
 * Nothing else in the app changes: AiAdvisorService, the controller, and
 * the conversation model all still depend on the AdvisorEngine interface
 * only, unaware their concrete implementation is now a network call.
 */
class RemoteAdvisorEngine implements AdvisorEngine
{
    public function reply(
        AiAdvisorConversation $conversation,
        string $message,
        ?string $summary,
        Collection $recentMessages,
        Collection $groundingData,
    ): string {
        $response = $this->call('/reply', [
            'message' => $message,
            'summary' => $summary,
            'recent_messages' => $recentMessages->map(fn ($m) => [
                'role' => $m->role,
                'content' => $m->content,
            ])->values(),
            'grounding_data' => $groundingData->values(),
        ]);

        return $response['reply'] ?? 'Sorry, I could not generate a response right now.';
    }

    public function summarize(string $transcript): ?string
    {
        $response = $this->call('/summarize', ['transcript' => $transcript]);

        return $response['summary'] ?? null;
    }

    /**
     * @return array|null Decoded JSON body, or null on any failure —
     *         never throws. A down/slow advisor microservice must degrade
     *         to "sorry, try again" in the chat UI, not a 500 error page.
     */
    private function call(string $endpoint, array $payload): ?array
    {
        $baseUrl = rtrim(config('services.ai_advisor.url'), '/');
        $token = config('services.ai_advisor.token');

        try {
            $response = Http::withHeaders(['X-Internal-Token' => $token])
                ->timeout(35) // slightly above the microservice's own 30s OpenRouter timeout
                ->post($baseUrl . $endpoint, $payload);

            if ($response->failed()) {
                Log::error('AI advisor service request failed', [
                    'endpoint' => $endpoint,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return null;
            }

            return $response->json();
        } catch (\Throwable $e) {
            Log::error('AI advisor service request exception', [
                'endpoint' => $endpoint,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }
}