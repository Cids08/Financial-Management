<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

class FinancialForecastDetailResource extends FinancialForecastResource
{
    public function toArray(Request $request): array
    {
        // Reads the series captured at generation time
        // (FinancialForecastService::generate() -> ForecastEngine::buildSeries())
        // rather than recomputing it here. Recomputing would mean asking
        // a real (non-mock) engine to re-derive "lookback_months back from
        // today," which drifts further from what the forecast actually
        // trained on with every day that passes after generation — see
        // migration 2026_08_16_000001_add_series_to_financial_forecasts_table.
        return [
            ...parent::toArray($request),
            'series' => $this->series ?? [],
        ];
    }
}