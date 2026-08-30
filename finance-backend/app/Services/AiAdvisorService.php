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
 */
class AiAdvisorService
{
    private const RECENT_MESSAGE_LIMIT = 6;
    private const SUMMARIZE_THRESHOLD = 12;
    private const GROUNDING_LIMIT = 20;

    // Plain acknowledgments carry no real question, so there's nothing for
    // the model to reason about. This is also the exact input shape where
    // the free-tier model has been observed to latch onto an older topic
    // from earlier in the conversation instead of just acknowledging (e.g.
    // replying about "invoices" when the acknowledgment followed a graph
    // question). Handling these deterministically sidesteps that
    // unreliability entirely and costs zero API calls.
    private const PLAIN_ACKNOWLEDGMENTS = [
        'ok', 'okay', 'okay sure', 'ok sure', 'sure', 'got it', 'gotit',
        'alright', 'aight', 'noted', 'thanks', 'thank you', 'thanks!',
        'thank you!', 'k', 'kk', 'yep', 'yup', 'cool', 'nice',
    ];

    private const ACKNOWLEDGMENT_REPLIES = [
        "Sure, just let me know if you need anything else.",
        "Got it, I'm here if you have more questions.",
        "Alright, let me know what you'd like to look at next.",
    ];

    public function __construct(private AdvisorEngine $engine)
    {
    }

    public function respond(AiAdvisorConversation $conversation, string $message): string
    {
        // IMPORTANT: fetch history BEFORE inserting the new message. This
        // must represent strictly PRIOR turns — the engine appends $message
        // itself as the final turn. Fetching after insertion (the previous
        // bug) duplicated the current message: once as the last entry in
        // $recent, once via the explicit $message param, sending two
        // identical consecutive user turns to the model. That duplication
        // was why the advisor kept re-answering the previous question
        // instead of responding to genuinely new input like "hi".
        $recent = $conversation->messages()
            ->latest()
            ->take(self::RECENT_MESSAGE_LIMIT)
            ->get()
            ->reverse()
            ->values();

        DB::transaction(function () use ($conversation, $message) {
            $conversation->messages()->create([
                'role' => 'user',
                'content' => $message,
            ]);

            if (! $conversation->title) {
                $conversation->update(['title' => Str::limit($message, 60)]);
            }
        });

        $reply = $this->isPlainAcknowledgment($message) && ! $this->lastAssistantMessageMadeAnOffer($recent)
            ? self::ACKNOWLEDGMENT_REPLIES[array_rand(self::ACKNOWLEDGMENT_REPLIES)]
            : $this->engine->reply(
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

    /**
     * True only for a short, plain acknowledgment with no real content beyond
     * confirming receipt (e.g. "okay", "got it", "thanks"). Deliberately
     * narrow: anything with extra words ("okay but what about...") falls
     * through to the LLM as normal, since it may contain a real follow-up.
     */
    private function isPlainAcknowledgment(string $message): bool
    {
        $normalized = strtolower(trim($message, " \t\n\r\0\x0B.!?"));

        return in_array($normalized, self::PLAIN_ACKNOWLEDGMENTS, true);
    }

    // Phrases that mean the assistant's last message was offering to do
    // something further, not just stating information. "Okay"/"sure" right
    // after one of these means YES DO IT, not "thanks, I heard you" — so the
    // deterministic short-circuit must not swallow it. Keep this list to
    // patterns the advisor's own system prompt tends to produce (it's told
    // to offer next steps), not a general-purpose question detector.
    private const OFFER_PHRASES = [
        'let me know if you need',
        'let me know if you want',
        'would you like',
        'want me to',
        'do you want',
        'should i',
        'need a step-by-step',
        'need help with',
        'shall i',
    ];

    private function lastAssistantMessageMadeAnOffer($recent): bool
    {
        $lastAssistant = collect($recent)
            ->filter(fn ($m) => $m->role === 'assistant')
            ->last();

        if (! $lastAssistant) {
            return false;
        }

        $content = strtolower($lastAssistant->content);

        foreach (self::OFFER_PHRASES as $phrase) {
            if (str_contains($content, $phrase)) {
                return true;
            }
        }

        return false;
    }

    private function groundingContext()
    {
        return AiRecommendation::query()
            ->with('forecast')
            ->orderByDesc('generated_at')
            ->limit(self::GROUNDING_LIMIT)
            ->get()
            ->map(fn (AiRecommendation $r) => [
                'category' => $r->category,
                'priority' => $r->priority,
                'recommendation_confidence_score' => $r->confidence_score,
                'summary' => $r->summary,
                'forecast_type' => $r->forecast?->forecast_type,
                'forecast_period' => $r->forecast?->forecast_period,
                'forecast_confidence_level' => $r->forecast?->confidence_level,
                'forecast_predicted_amount' => $r->forecast?->predicted_amount,
            ]);
    }
}