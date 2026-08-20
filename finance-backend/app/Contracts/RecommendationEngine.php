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
     * Field names below use the app-level convention ('type') rather than
     * the raw DB column name ('category') — GenerateAiRecommendations maps
     * 'type' -> the `category` column when inserting. This keeps the
     * engine-facing contract readable while staying decoupled from the
     * exact DB schema.
     *
     * @return Collection<int, array{
     *   type: string,
     *   priority: string,
     *   confidence_score: float,
     *   summary: string,
     *   recommendation: string,
     * }>
     *         'type' must be one of: Cash Flow Management, Cost Reduction,
     *         Revenue Optimization, Risk Alert, Budget Adjustment.
     *         'priority' must be one of: High, Medium, Low.
     *         'confidence_score' is 0-100 (numeric(5,2) in the DB) — the
     *         engine's own confidence in this specific recommendation,
     *         distinct from the forecast's own confidence_level.
     */
    public function generate(FinancialForecast $forecast): Collection;
}