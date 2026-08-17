<?php

namespace App\Services;

use App\Contracts\AdvisorEngine;
use App\Jobs\SummarizeAiAdvisorConversation;
use App\Models\AiAdvisorConversation;
use App\Models\AiRecommendation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Coordinates AI-advisor chat: grounds every reply in real AiRecommendation /
 * forecast data (never invented figures), and keeps the prompt bounded
 * regardless of how long a conversation runs, by only ever replaying the most
 * recent messages verbatim plus a rolling summary of everything older.
 *
 * Delegates the actual reply generation to an AdvisorEngine — currently
 * bound to MockAdvisorEngine (free, no API key) in AppServiceProvider.
 * Swap the binding to OpenAiAdvisorEngine once a paid key is available;
 * nothing in this class needs to change.
 */
class AiAdvisorService
{
    /** Full-text turns replayed verbatim on every request. */
    private const RECENT_MESSAGE_LIMIT = 6;

    /** Once a conversation exceeds this many stored messages, queue a summarization pass. */
    private const SUMMARIZE_THRESHOLD = 12;

    /** How many recommendations to ground the assistant's context in. */
    private const GROUNDING_LIMIT = 20;

    public function __construct(private AdvisorEngine $engine)
    {
    }

    public function respond(AiAdvisorConversation $conversation, string $message): string
    {
        DB::transaction(function () use ($conversation, $message) {
            $conversation->messages()->create([
                'role' => 'user',
                'content' => $message,
            ]);

            if (! $conversation->title) {
                $conversation->update(['title' => Str::limit($message, 60)]);
            }
        });

        $recent = $conversation->messages()
            ->latest()
            ->take(self::RECENT_MESSAGE_LIMIT)
            ->get()
            ->reverse()
            ->values();

        $reply = $this->engine->reply(
            conversation: $conversation,
            message: $message,
            summary: $conversation->summary,
            recentMessages: $recent,
            groundingData: $this->groundingContext(),
        );

        $conversation->messages()->create([
            'role' => 'assistant',
            'content' => $reply,
        ]);

        if ($conversation->messages()->count() > self::SUMMARIZE_THRESHOLD) {
            SummarizeAiAdvisorConversation::dispatch($conversation);
        }

        return $reply;
    }

    private function groundingContext()
    {
        return AiRecommendation::query()
            ->with('forecast')
            ->orderByDesc('generated_at')
            ->limit(self::GROUNDING_LIMIT)
            ->get()
            ->map(fn (AiRecommendation $r) => [
                'type' => $r->recommendation_type,
                'summary' => $r->summary,
                'forecast_type' => $r->forecast?->forecast_type,
                'forecast_period' => $r->forecast?->forecast_period,
            ]);
    }
}