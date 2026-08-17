<?php

namespace App\Contracts;

use App\Models\AiAdvisorConversation;
use Illuminate\Support\Collection;

/**
 * Abstraction over "whatever generates the advisor's reply text."
 *
 * AiAdvisorService depends on this interface only — it never talks to
 * OpenAI (or anything else) directly. That means the concrete engine can be
 * swapped in AppServiceProvider without touching the controller, service,
 * or job that summarizes long conversations.
 */
interface AdvisorEngine
{
    /**
     * Generate a reply to $message, grounded in $groundingData, given the
     * conversation's rolling $summary (nullable) and its most recent turns.
     *
     * @param  Collection<int, \App\Models\AiAdvisorMessage>  $recentMessages
     * @param  Collection<int, array>  $groundingData
     */
    public function reply(
        AiAdvisorConversation $conversation,
        string $message,
        ?string $summary,
        Collection $recentMessages,
        Collection $groundingData,
    ): string;

    /**
     * Summarize an older chunk of a conversation into 3-4 factual sentences,
     * for the memory-compression job. Return null if summarization isn't
     * supported by this engine (the job will skip pruning until it is).
     */
    public function summarize(string $transcript): ?string;
}