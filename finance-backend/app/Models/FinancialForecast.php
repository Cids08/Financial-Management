<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinancialForecast extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'forecast_no',
        'forecast_name',
        'forecast_type',
        'forecast_target',
        'historical_start',
        'historical_end',
        'forecast_start',
        'forecast_end',
        'forecast_period',
        'actual_amount',
        'predicted_amount',
        'confidence_level',
        'mape',
        'rmse',
        'algorithm',
        'model_version',
        // Whether the ARIMA optimizer converged for this forecast. See
        // migration 2026_08_30_000000_add_converged_to_financial_forecasts_table
        // and FinancialForecastService::generate().
        'converged',
        // Added so FinancialForecastService::generate()'s
        // 'series' => $series actually persists — without this in
        // $fillable, create() silently drops the key rather than erroring.
        'series',
        'status',
        'generated_by',
        'updated_by',
        'generated_at',
        'remarks',
        'deleted_by',
    ];

    protected $casts = [
        'historical_start' => 'date',
        'historical_end' => 'date',
        'forecast_start' => 'date',
        'forecast_end' => 'date',
        'actual_amount' => 'decimal:2',
        'predicted_amount' => 'decimal:2',
        'confidence_level' => 'decimal:2',
        'mape' => 'decimal:2',
        'rmse' => 'decimal:2',
        'generated_at' => 'datetime',
        // Ensures $forecast->converged is a real PHP bool regardless of
        // driver quirks, matching the boolean column added by the
        // add_converged_to_financial_forecasts_table migration.
        'converged' => 'boolean',
        // Added to match the new jsonb series column — without this,
        // $forecast->series is a raw JSON string, not a PHP array, and
        // FinancialForecastDetailResource's 'series' => $this->series
        // would serialize it as a double-encoded JSON string to the frontend.
        'series' => 'array',
    ];

    public function generator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Inverse of AiRecommendation::forecast(). Added specifically so a
     * backfill command can find forecasts with zero recommendations via
     * whereDoesntHave('aiRecommendations') — e.g. the ones that failed
     * during the forecast_period 422 bug / the internal-token 401 bug and
     * never got recommendations generated at all, since
     * GenerateAiRecommendations only ever fires once, at forecast
     * creation time, and never retries on its own.
     */
    public function aiRecommendations(): HasMany
    {
        return $this->hasMany(AiRecommendation::class, 'forecast_id');
    }

    /**
     * String label for forecast_period (e.g. "next_fiscal_year") for
     * consumers — like the AI recommendation microservice — that expect
     * a label rather than the raw integer month count stored in the
     * forecast_period column.
     *
     * Deliberately derived from FinancialForecastService::HORIZON_LABELS
     * (the same map generate() uses to write forecast_period in the first
     * place — 'next_month' => 1, 'next_quarter' => 3, 'next_fiscal_year'
     * => 12) rather than a second constant duplicated here. Two sources
     * of truth for the same int<->label mapping would drift the moment
     * either one changes.
     *
     * Falls back to the stringified integer for any value that doesn't
     * match one of the known horizons, so an unexpected value degrades to
     * something inspectable in logs rather than throwing.
     */
    public function getForecastPeriodLabelAttribute(): string
    {
        foreach (\App\Services\FinancialForecastService::HORIZON_LABELS as $label => $config) {
            if ($config['months'] === $this->forecast_period) {
                return $label;
            }
        }

        return (string) $this->forecast_period;
    }
}