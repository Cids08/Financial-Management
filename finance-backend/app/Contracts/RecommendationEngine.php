<?php

namespace App\Contracts;

use App\Models\FinancialForecast;
use Illuminate\Support\Collection;

/**
 * Abstraction over "whatever turns a completed forecast into recommendation
 * text." This is deliberately separate from AdvisorEngine (which answers
 * chat questions) — this one WRITES new ai_recommendations rows, the chat
 * engine only READS them for context. Different responsibility, different
 * interface, same swap-the-binding pattern.
 */
interface RecommendationEngine
{
    /**
     * Analyze $forecast and return zero or more recommendations to persist.
     *
     * @return Collection<int, array{type: string, summary: string, recommendation: string}>
     *         'type' must be one of RECOMMENDATION_TYPES on the frontend:
     *         Cash Flow Management, Cost Reduction, Revenue Optimization,
     *         Risk Alert, Budget Adjustment.
     */
    public function generate(FinancialForecast $forecast): Collection;
}