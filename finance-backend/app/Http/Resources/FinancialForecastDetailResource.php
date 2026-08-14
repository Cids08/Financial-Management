<?php

namespace App\Http\Resources;

use App\Contracts\ForecastEngine;
use Illuminate\Http\Request;

class FinancialForecastDetailResource extends FinancialForecastResource
{
    public function toArray(Request $request): array
    {
        // No `series` column exists in financial_forecasts — this was
        // always synthetic/derived data even in the original frontend
        // (buildSeries()), never something to persist. Recomputed here
        // from the engine so the detail view has something to chart;
        // once the real Python service exists, point this at its actual
        // historical-actuals + forecast-points output instead.
        $engine = app(ForecastEngine::class);

        return [
            ...parent::toArray($request),
            'series' => $engine->buildSeries(
                $this->forecast_type,
                $this->horizonKeyFromPeriod(),
                (float) $this->predicted_amount
            ),
        ];
    }

    protected function horizonKeyFromPeriod(): string
    {
        return match ((int) $this->forecast_period) {
            1 => 'next_month',
            3 => 'next_quarter',
            12 => 'next_fiscal_year',
            default => 'next_month',
        };
    }
}