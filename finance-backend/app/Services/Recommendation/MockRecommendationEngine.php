<?php

namespace App\Services\Recommendation;

use App\Contracts\RecommendationEngine;
use App\Models\FinancialForecast;
use Illuminate\Support\Collection;

/**
 * Zero-cost stand-in for a real LLM backend. Turns a completed forecast into
 * one or two recommendations using simple threshold rules instead of an API
 * call.
 *
 * 'type' values are constrained to EXACTLY Revenue/Expense/Cash Flow/Budget
 * — confirmed against the real ai_recommendations_category_check constraint.
 * Earlier versions of this engine used a richer 5-value taxonomy (Cash Flow
 * Management, Cost Reduction, Revenue Optimization, Risk Alert, Budget
 * Adjustment) that doesn't exist in the DB at all — every one of those
 * values would fail the CHECK constraint on insert.
 *
 * NOTE: reads $forecast->confidence_level (a float, assumed 0-1 like 0.87;
 * normalized below in case it's actually stored 0-100), ->forecast_type,
 * ->predicted_amount, and ->forecast_period.
 */
class MockRecommendationEngine implements RecommendationEngine
{
    public function generate(FinancialForecast $forecast): Collection
    {
        $recommendations = collect();

        $rawConfidence = $forecast->confidence_level ?? null;
        $confidence = $rawConfidence !== null
            ? ($rawConfidence <= 1 ? $rawConfidence * 100 : $rawConfidence)
            : null;
        $type = $forecast->forecast_type ?? 'Forecast';
        $period = $forecast->forecast_period ?? 'the upcoming period';
        $amount = $forecast->predicted_amount ?? null;

        if ($confidence !== null && $confidence < 60) {
            $recommendations->push([
                'type' => 'Budget',
                'priority' => 'High',
                'confidence_score' => 70.0,
                'summary' => "The {$type} forecast for {$period} carries below-average confidence "
                    . "(" . round($confidence) . "%). Treat the projected figure as directional "
                    . "rather than exact when setting budgets.",
                'recommendation' => "Confidence for this {$type} forecast is "
                    . round($confidence) . "%, below the 60% threshold typically considered "
                    . "reliable for planning. Consider widening budget contingency for {$period} "
                    . "and revisiting this forecast once more historical data is available. "
                    . "This is a system-generated flag, not a guarantee of under- or "
                    . "over-performance — management judgment should confirm any budget change.",
            ]);
        }

        $recommendations = $recommendations->merge($this->typeSpecificRecommendation($forecast, $type, $period, $amount));

        return $recommendations;
    }

    private function typeSpecificRecommendation(FinancialForecast $forecast, string $type, string $period, $amount): Collection
    {
        $normalized = str_contains(strtolower($type), 'expense') || str_contains(strtolower($type), 'disbursement')
            ? 'expense'
            : (str_contains(strtolower($type), 'revenue') || str_contains(strtolower($type), 'collection')
                ? 'revenue'
                : 'other');

        $amountText = $amount !== null ? number_format((float) $amount, 2) : 'an unspecified amount';

        return match ($normalized) {
            'expense' => collect([[
                'type' => 'Expense',
                'priority' => 'Medium',
                'confidence_score' => 75.0,
                'summary' => "Projected {$type} for {$period} is {$amountText}. Review recurring "
                    . "expense categories for potential reductions ahead of this period.",
                'recommendation' => "The ARIMA model projects {$type} of approximately {$amountText} "
                    . "for {$period}. If this represents an increase over recent actuals, review "
                    . "discretionary expense categories now rather than after the period closes. "
                    . "This is an automated observation based on forecast trend only — confirm "
                    . "against actual budget data before acting.",
            ]]),
            'revenue' => collect([[
                'type' => 'Revenue',
                'priority' => 'Medium',
                'confidence_score' => 75.0,
                'summary' => "Projected {$type} for {$period} is {$amountText}. Review collection "
                    . "and invoicing timelines to help realize this projection.",
                'recommendation' => "The ARIMA model projects {$type} of approximately {$amountText} "
                    . "for {$period}. To help realize this, consider reviewing outstanding accounts "
                    . "receivable and collection follow-up timing for {$period}. This is a "
                    . "system-generated observation, not a guaranteed outcome.",
            ]]),
            default => collect([[
                'type' => 'Cash Flow',
                'priority' => 'Low',
                'confidence_score' => 70.0,
                'summary' => "New {$type} forecast available for {$period} ({$amountText}). "
                    . "Review alongside current cash position.",
                'recommendation' => "A new {$type} forecast of {$amountText} is available for "
                    . "{$period}. Compare this against the current cash flow position to confirm "
                    . "there is no near-term liquidity concern. This is a system-generated summary "
                    . "of the forecast, not financial advice.",
            ]]),
        };
    }
}