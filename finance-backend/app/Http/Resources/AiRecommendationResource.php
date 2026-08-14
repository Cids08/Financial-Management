<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Maps the real `ai_recommendations` + `financial_forecasts` schema onto the
 * field names AIRecommendations.jsx already expects, so the existing frontend
 * needs zero changes:
 *   - id            -> recommendation_id
 *   - category      -> recommendation_type
 *   - generated_by  -> generated_by (id) + generated_by_name (real name,
 *                      replacing the frontend's hardcoded GENERATORS map)
 *
 * ASSUMPTION worth confirming: the DB's `forecast_period` column is an
 * integer (looks like a period count, not a display label), and there's no
 * human-readable period string anywhere on financial_forecasts. This
 * resource computes one from forecast_start/forecast_end instead (e.g.
 * "Aug 2026" or "Aug 2026 – Oct 2026") and returns it under the same
 * `forecast_period` key the frontend already reads. If forecast_no or
 * forecast_name should be used for this label instead, this is the one
 * place to change it.
 */
class AiRecommendationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'recommendation_id' => $this->id,
            'forecast_id' => $this->forecast_id,
            'recommendation_type' => $this->category,
            'priority' => $this->priority,
            'summary' => $this->summary,
            'recommendation' => $this->recommendation,
            'confidence_score' => $this->confidence_score !== null ? (float) $this->confidence_score : null,
            'estimated_impact' => $this->estimated_impact !== null ? (float) $this->estimated_impact : null,
            'generated_by' => $this->generated_by,
            'generated_by_name' => $this->generator
                ? trim($this->generator->first_name . ' ' . $this->generator->last_name)
                : null,
            'generated_at' => $this->generated_at?->toIso8601String(),

            // Forecast context, flattened so the frontend doesn't need a
            // second lookup array (replaces the hardcoded FORECASTS mock).
            'forecast_type' => $this->forecast?->forecast_type,
            'forecast_period' => $this->formatForecastPeriod(),
            'forecast_predicted_amount' => $this->forecast?->predicted_amount !== null
                ? (float) $this->forecast->predicted_amount
                : null,
        ];
    }

    protected function formatForecastPeriod(): ?string
    {
        $forecast = $this->forecast;
        if (! $forecast || ! $forecast->forecast_start) {
            return null;
        }

        $start = $forecast->forecast_start;
        $end = $forecast->forecast_end;

        if (! $end || $start->isSameMonth($end)) {
            return $start->format('M Y');
        }

        return $start->format('M Y') . ' – ' . $end->format('M Y');
    }
}