<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FinancialForecastResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'forecast_id' => $this->id,
            'forecast_no' => $this->forecast_no,
            'forecast_name' => $this->forecast_name,
            'forecast_type' => $this->forecast_type,
            'forecast_target' => $this->forecast_target,
            // Frontend fields — DB stores actual date ranges, not
            // pre-formatted labels, so they're computed here.
            'forecast_period' => $this->forecastPeriodLabel(),
            'historical_period' => $this->historicalPeriodLabel(),
            'predicted_amount' => (float) $this->predicted_amount,
            'actual_amount' => $this->actual_amount !== null ? (float) $this->actual_amount : null,
            'confidence_level' => (float) $this->confidence_level,
            // Frontend calls this arima_model — DB column is `algorithm`.
            'arima_model' => $this->algorithm,
            'model_version' => $this->model_version,
            'mape' => $this->mape !== null ? (float) $this->mape : null,
            'rmse' => $this->rmse !== null ? (float) $this->rmse : null,
            // Whether the ARIMA optimizer actually converged when this
            // forecast was generated. False means arima_model reflects the
            // best available fit rather than a fully converged solution —
            // the frontend should show this as a lower-confidence estimate
            // rather than presenting it identically to a converged one,
            // per the forecasting philosophy of never treating forecasts
            // as guaranteed outcomes.
            'converged' => (bool) $this->converged,
            // UNCONFIRMED: financial_forecasts.status defaults to 'Generated'
            // but the allowed set (CHECK constraint, if any) hasn't been
            // confirmed — same caution as accounts_payable.status.
            'status' => $this->status,
            'generated_by' => $this->generated_by,
            'generated_by_name' => $this->whenLoaded('generator', fn () => $this->generator?->fullName()),
            'generated_at' => $this->generated_at?->toIso8601String(),
            'remarks' => $this->remarks,
        ];
    }

    protected function forecastPeriodLabel(): string
    {
        $start = $this->forecast_start;
        $end = $this->forecast_end;
        if (!$start) return '—';

        return match ((int) $this->forecast_period) {
            1 => $start->format('F Y'),
            3 => 'Q' . (int) ceil($start->month / 3) . ' ' . $start->format('Y'),
            12 => 'FY ' . ($end?->format('Y') ?? $start->format('Y')),
            default => $end ? "{$start->format('M Y')} – {$end->format('M Y')}" : $start->format('M Y'),
        };
    }

    protected function historicalPeriodLabel(): string
    {
        $start = $this->historical_start;
        $end = $this->historical_end;
        if (!$start || !$end) return '—';

        return "{$start->format('M Y')} – {$end->format('M Y')}";
    }
}