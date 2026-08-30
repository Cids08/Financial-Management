<?php

namespace App\Contracts;

use App\Models\FinancialForecast;
use Illuminate\Support\Collection;

/**
 * Abstraction over "whatever turns a completed forecast into recommendation
 * text." Separate from AdvisorEngine (which answers chat questions) — this
 * one WRITES new ai_recommendations rows, the chat engine only READS them.
 */
interface RecommendationEngine
{
    /**
     * Analyze $forecast and return zero or more recommendations to persist.
     *
     * @return Collection<int, array{
     *   type: string,
     *   priority: string,
     *   confidence_score: float,
     *   summary: string,
     *   recommendation: string,
     * }>
     *         'type' maps onto the `category` column and is constrained by
     *         ai_recommendations_category_check to EXACTLY these 4 values
     *         (confirmed against the real DB constraint — NOT the same
     *         taxonomy as the frontend's old 5-value RECOMMENDATION_TYPES
     *         list, which does not match this constraint):
     *           Revenue, Expense, Cash Flow, Budget
     *         'priority' is constrained by ai_recommendations_priority_check
     *         to: Low, Medium, High, Critical.
     *         'confidence_score' is 0-100 (numeric(5,2) in the DB) — the
     *         engine's own confidence in this specific recommendation,
     *         distinct from the forecast's own confidence_level.
     */
    public function generate(FinancialForecast $forecast): Collection;
}