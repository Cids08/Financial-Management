<?php

namespace App\Services\Advisor;

use App\Contracts\AdvisorEngine;
use App\Models\AiAdvisorConversation;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Zero-cost stand-in for a real LLM backend. Answers are generated with
 * simple keyword matching over the same AiRecommendation data an OpenAI
 * engine would be grounded in — so the advisor stays fully functional (and
 * fully offline / free) for development, testing, and thesis defense, with
 * no API key and no per-request cost.
 *
 * Swap the binding in AppServiceProvider to OpenAiAdvisorEngine once a paid
 * OpenAI key is available — nothing else in the app needs to change.
 */
class MockAdvisorEngine implements AdvisorEngine
{
    public function reply(
        AiAdvisorConversation $conversation,
        string $message,
        ?string $summary,
        Collection $recentMessages,
        Collection $groundingData,
    ): string {
        $q = Str::lower($message);

        if (Str::contains($q, ['risk', 'alert'])) {
            return $this->listByType($groundingData, 'Risk Alert', 'Risk Alert');
        }

        if (Str::contains($q, ['confidence', 'lowest', 'uncertain'])) {
            $item = $groundingData->firstWhere('type', 'Budget Adjustment') ?? $groundingData->first();

            if (! $item) {
                return "There isn't enough data yet to answer that.";
            }

            return "{$this->forecastLabel($item)} currently carries the most uncertainty among "
                . "active models. Related guidance: \"{$item['summary']}\"";
        }

        if (Str::contains($q, ['expense', 'cost', 'reduce', 'cut'])) {
            return $this->listByType($groundingData, 'Cost Reduction', 'Cost Reduction');
        }

        if (Str::contains($q, 'collect')) {
            return $this->listByType($groundingData, 'Cash Flow Management', 'collections');
        }

        if (Str::contains($q, 'revenue')) {
            return $this->listByType($groundingData, 'Revenue Optimization', 'Revenue Optimization');
        }

        if (Str::contains($q, 'summar')) {
            if ($groundingData->isEmpty()) {
                return 'There are no recommendations to summarize yet.';
            }

            return $groundingData->take(4)
                ->map(fn ($r) => "• [{$r['type']}] {$r['summary']}")
                ->implode("\n");
        }

        return 'I can help with cash flow, cost reduction, revenue, collections, budget, or risk '
            . 'questions — try asking about one of those. '
            . '(Running on the free mock advisor — connect a real OpenAI key for open-ended questions.)';
    }

    public function summarize(string $transcript): ?string
    {
        // No paid API to call — fall back to a naive truncation. This keeps
        // the summarization job harmless (never fails, never costs money);
        // it just won't be as coherent as a real LLM summary.
        $lines = collect(explode("\n", $transcript))
            ->filter(fn ($line) => trim($line) !== '')
            ->values();

        if ($lines->isEmpty()) {
            return null;
        }

        $condensed = $lines->map(fn ($line) => Str::limit($line, 120))->implode(' ');

        return Str::limit($condensed, 400, '…');
    }

    private function listByType(Collection $groundingData, string $type, string $emptyLabel): string
    {
        $matches = $groundingData->where('type', $type);

        if ($matches->isEmpty()) {
            return "No {$emptyLabel} recommendations are open at the moment.";
        }

        return $matches->map(fn ($r) => "• {$r['summary']} ({$this->forecastLabel($r)})")->implode("\n");
    }

    private function forecastLabel(array $r): string
    {
        if (! empty($r['forecast_type']) && ! empty($r['forecast_period'])) {
            return "{$r['forecast_type']} — {$r['forecast_period']}";
        }

        return 'Unlinked forecast';
    }
}