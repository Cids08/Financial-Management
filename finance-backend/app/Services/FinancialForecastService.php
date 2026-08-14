<?php

namespace App\Services;

use App\Contracts\ForecastEngine;
use App\Models\AuditLog;
use App\Models\FinancialForecast;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

class FinancialForecastService
{
    public const FORECAST_TYPES = ['Cash Flow', 'Revenue', 'Collections', 'Expenses', 'Accounts Receivable'];

    // months = forecast_period value stored in the DB (the integer column);
    // lookback_months = training window length.
    public const HORIZON_LABELS = [
        'next_month' => ['months' => 1, 'lookback_months' => 6],
        'next_quarter' => ['months' => 3, 'lookback_months' => 8],
        'next_fiscal_year' => ['months' => 12, 'lookback_months' => 24],
    ];

    public function __construct(protected ForecastEngine $engine)
    {
    }

    public function list(): Collection
    {
        return FinancialForecast::query()
            ->with('generator')
            ->orderByDesc('generated_at')
            ->get();
    }

    public function find(int $id): FinancialForecast
    {
        return FinancialForecast::query()->with('generator')->findOrFail($id);
    }

    public function generate(User $actor, string $forecastType, string $horizonKey): FinancialForecast
    {
        return DB::transaction(function () use ($actor, $forecastType, $horizonKey) {
            $horizon = self::HORIZON_LABELS[$horizonKey];
            $result = $this->engine->generate($forecastType, $horizonKey);

            $today = Carbon::today();
            $forecastStart = $today->copy()->addMonthNoOverflow()->startOfMonth();
            $forecastEnd = $forecastStart->copy()->addMonths($horizon['months'] - 1)->endOfMonth();
            $historicalStart = $today->copy()->subMonthsNoOverflow($horizon['lookback_months'] - 1)->startOfMonth();
            $historicalEnd = $today->copy()->endOfMonth();

            $forecast = FinancialForecast::create([
                'forecast_no' => $this->generateForecastNo(),
                'forecast_name' => "{$forecastType} Forecast — " . $forecastStart->format('M Y'),
                'forecast_type' => $forecastType,
                // No finer-grained target scope exists in this app yet
                // (no per-department/per-account forecasting UI) — see
                // note in chat. Defaulting to company-wide.
                'forecast_target' => 'Company-wide',
                'historical_start' => $historicalStart,
                'historical_end' => $historicalEnd,
                'forecast_start' => $forecastStart,
                'forecast_end' => $forecastEnd,
                'forecast_period' => $horizon['months'],
                'predicted_amount' => $result['predicted_amount'],
                'confidence_level' => $result['confidence_level'],
                'mape' => $result['mape'],
                'rmse' => $result['rmse'],
                'algorithm' => $result['algorithm'],
                'model_version' => $result['model_version'],
                // status left to the DB default ('Generated') — see the
                // unconfirmed-CHECK-constraint note in the resource.
                'generated_by' => $actor->id,
                'generated_at' => now(),
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Financial Forecasting',
                'action' => 'generate',
                'record_id' => $forecast->id,
                'activity_description' => "Generated {$forecastType} forecast ({$forecast->forecast_no}).",
                'new_values' => $forecast->only(['forecast_type', 'predicted_amount', 'confidence_level']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $forecast->load('generator');
        });
    }

    protected function generateForecastNo(): string
    {
        $next = FinancialForecast::withTrashed()->max('id') + 1;
        return 'FCST-' . str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }
}