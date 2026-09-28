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

        // Config problems are logged before the call, not only on failure. The
        // one that actually bit us: config/services.php defaults
        // AI_ADVISOR_SERVICE_URL to http://localhost:8002, so a hosted backend
        // with the env var missing (or stale `config:cache` baked in at build
        // time) quietly posts to its own localhost. The connection error looked
        // identical to a microservice outage, so the resolved URL and token
        // presence are now on the record for every attempt.
        if (! $baseUrl) {
            Log::error('AI advisor service not configured', [
                'endpoint' => $endpoint,
                'hint' => 'AI_ADVISOR_SERVICE_URL resolved to empty. Set it and run "php artisan config:clear".',
            ]);

            return null;
        }

        if (! $token) {
            Log::error('AI advisor service token missing', [
                'endpoint' => $endpoint,
                'url' => $baseUrl,
                'hint' => 'AI_ADVISOR_SERVICE_TOKEN is empty; it must match INTERNAL_SERVICE_TOKEN on the microservice. Also run "php artisan config:clear".',
            ]);

            return null;
        }

        try {
            $response = Http::withHeaders(['X-Internal-Token' => $token])
                ->timeout(35) // slightly above the microservice's own 30s OpenRouter timeout
                ->post($baseUrl . $endpoint, $payload);

            if ($response->failed()) {
                Log::error('AI advisor service request failed', [
                    'endpoint' => $endpoint,
                    'url' => $baseUrl,
                    'status' => $response->status(),
                    // The microservice reports upstream reasons (upstream_401,
                    // empty_output, timeout, ...) in this body since it stopped
                    // swallowing them, so the real cause is here rather than
                    // only in that service's stdout.
                    'body' => \Illuminate\Support\Str::limit($response->body(), 1000),
                ]);

                return null;
            }

            return $response->json();
        } catch (\Throwable $e) {
            Log::error('AI advisor service request exception', [
                'endpoint' => $endpoint,
                'url' => $baseUrl,
                'error' => $e->getMessage(),
                'hint' => $e instanceof \Illuminate\Http\Client\ConnectionException
                    ? 'Could not reach the microservice. If the URL is a real public host, check firewall/security-group egress; if it is localhost, AI_ADVISOR_SERVICE_URL is unset or config is cached — run "php artisan config:clear".'
                    : null,
            ]);

            return null;
        }
    }
}