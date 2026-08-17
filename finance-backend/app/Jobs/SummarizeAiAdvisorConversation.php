<?php

namespace App\Jobs;

use App\Contracts\AdvisorEngine;
use App\Models\AiAdvisorConversation;
use App\Models\AiAdvisorMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

/**
 * Compresses older turns of a long-running AI advisor conversation into a
 * single rolling summary, then deletes the compressed rows. This keeps both
 * the prompt size and the ai_advisor_messages table bounded no matter how
 * long a conversation runs — memory without unbounded cost or storage.
 *
 * Runs on the queue so it never blocks the user's chat request. Summarization
 * itself is delegated to whatever AdvisorEngine is currently bound (the free
 * MockAdvisorEngine does a naive truncation; a real engine like
 * OpenAiAdvisorEngine produces an actual LLM summary) — this job doesn't care
 * which.
 */
class SummarizeAiAdvisorConversation implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Messages left untouched — must match AiAdvisorService::RECENT_MESSAGE_LIMIT. */
    private const KEEP_RECENT = 6;

    public function __construct(private AiAdvisorConversation $conversation)
    {
    }

    public function handle(AdvisorEngine $engine): void
    {
        $totalMessages = $this->conversation->messages()->count();
        $toCompressCount = $totalMessages - self::KEEP_RECENT;

        if ($toCompressCount <= 0) {
            return;
        }

        $toCompress = $this->conversation->messages()
            ->oldest()
            ->take($toCompressCount)
            ->get();

        if ($toCompress->isEmpty()) {
            return;
        }

        $transcript = $toCompress
            ->map(fn (AiAdvisorMessage $m) => "{$m->role}: {$m->content}")
            ->implode("\n");

        $newSummary = $engine->summarize($transcript);

        if ($newSummary === null) {
            // Don't delete messages if summarization failed/unsupported — retry on next threshold hit.
            return;
        }

        DB::transaction(function () use ($newSummary, $toCompress) {
            $existing = $this->conversation->summary;
            $combined = $existing ? trim($existing . "\n" . $newSummary) : $newSummary;

            $this->conversation->update(['summary' => $combined]);

            AiAdvisorMessage::whereIn('id', $toCompress->pluck('id'))->delete();
        });
    }
}