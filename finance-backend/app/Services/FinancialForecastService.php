<?php

namespace App\Services;

use App\Contracts\ForecastEngine;
use App\Jobs\GenerateAiRecommendations;
use App\Models\AuditLog;
use App\Models\FinancialForecast;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

class FinancialForecastService
{
    // Exactly 5 categories per spec: Expense, Accounts Receivable,
    // Collection, Cash Flow, and Budget Utilization forecasts. 'Revenue'
    // removed (not in the 5; its data source — chart_of_accounts/
    // journal_entries — isn't part of this spec either). 'Invoices'
    // renamed back to 'Accounts Receivable' (same underlying data —
    // outstanding AR balance reconstruction) — invoices stay
    // transactional data feeding AR, not their own forecast category,
    // per the stated Invoice → AR → Collection → Cash Flow relationship.
    // 'Budget Utilization' maps to the existing 'Budget'
    // forecast_target category — see FORECAST_TARGET_MAP below.
    public const FORECAST_TYPES = [
        'Cash Flow',
        'Collections',
        'Expenses',
        'Accounts Receivable',
        'Budget Utilization',
    ];

    // financial_forecasts.forecast_target has its own DB-level CHECK
    // constraint restricting it to exactly ['Revenue', 'Expense',
    // 'Cash Flow', 'Budget'] — a financial-statement category, NOT a
    // scope descriptor (the previous 'Company-wide' hardcode assumed the
    // latter and violated the constraint). This maps each forecast_type
    // value to one of those 4 allowed categories.
    // 'Accounts Receivable' and 'Collections' have no exact match among
    // the CHECK constraint's 4 categories; both deliberately map to
    // 'Cash Flow' — confirmed choice, not a guess. Budget Utilization
    // maps to 'Budget'.
    public const FORECAST_TARGET_MAP = [
        'Expenses' => 'Expense',
        'Cash Flow' => 'Cash Flow',
        'Collections' => 'Cash Flow',
        'Accounts Receivable' => 'Cash Flow',
        'Budget Utilization' => 'Budget',
    ];

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

    /**
     * @param string $status 'active' (default — excludes archived, via
     *   FinancialForecast's normal SoftDeletes global scope), 'archived'
     *   (only archived), or 'all' (both). Same convention as every other
     *   archive/restore module in this app.
     */
    public function list(string $status = 'active'): Collection
    {
        $query = match ($status) {
            'archived' => FinancialForecast::onlyTrashed(),
            'all' => FinancialForecast::withTrashed(),
            default => FinancialForecast::query(),
        };

        return $query
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

            // Built from the SAME engine call/request cycle as $result above
            // (not deferred to the detail view) — this is what the new
            // `series` column exists to freeze in place. See migration
            // 2026_08_16_000001_add_series_to_financial_forecasts_table.
            //
            // For a real (non-mock) engine implementation, generate() and
            // buildSeries() should share the same underlying historical
            // data / ARIMA response internally (e.g. via a short-lived
            // cache keyed by forecastType+horizonKey on the engine
            // instance) rather than each independently re-fetching from
            // the DB and re-calling the Python service — otherwise this
            // pair of calls doubles the ARIMA service round-trip for
            // every single generate().
            $series = $this->engine->buildSeries($forecastType, $horizonKey, $result['predicted_amount']);

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
                // (no per-department/per-account forecasting UI). This
                // was previously hardcoded to 'Company-wide', which
                // violates the actual DB CHECK constraint on this column
                // — forecast_target is a financial-statement category,
                // not a scope descriptor. See FORECAST_TARGET_MAP above.
                'forecast_target' => self::FORECAST_TARGET_MAP[$forecastType],
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
                // Whether the Python service's ARIMA optimizer converged
                // for this forecast — see ForecastEngine::generate()'s
                // return contract and migration
                // 2026_08_30_000000_add_converged_to_financial_forecasts_table.
                // Defaults true for engines (e.g. MockForecastEngine) that
                // don't populate this key at all.
                'converged' => $result['converged'] ?? true,
                'series' => $series,
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

            // Turns this forecast into ai_recommendations row(s) via
            // whichever RecommendationEngine is bound in AppServiceProvider
            // (OpenAiRecommendationEngine as of now). Queued — never blocks
            // this request, per the ai-forecasting skill's "do not block
            // user requests unnecessarily." Requires `php artisan queue:work`
            // to actually be running, or this sits pending indefinitely.
            GenerateAiRecommendations::dispatch($forecast, $actor->id);

            return $forecast->load('generator');
        });
    }

    /**
     * Soft-deletes the forecast (archive, not destroy) — the historical
     * prediction stays in the DB for audit purposes, it just drops out of
     * the default active listing. Relies on FinancialForecast using the
     * SoftDeletes trait (inferred from generateForecastNo()'s use of
     * withTrashed() above) — verify that trait is actually present on the
     * model before relying on this in production; if it's missing,
     * ->delete() here would hard-delete the row instead of archiving it.
     */
    public function archive(User $actor, FinancialForecast $forecast): FinancialForecast
    {
        $forecast->delete();

        AuditLog::create([
            'user_id' => $actor->id,
            'module' => 'Financial Forecasting',
            'action' => 'archive',
            'record_id' => $forecast->id,
            'activity_description' => "Archived {$forecast->forecast_type} forecast ({$forecast->forecast_no}).",
            'new_values' => null,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $forecast;
    }

    /**
     * Restores a previously archived forecast. $forecast must have been
     * resolved via a route/query that includes trashed rows (see
     * FinancialForecastController::restore() and its ->withTrashed()
     * route binding) — a normal lookup would 404 before this is reached.
     */
    public function restore(User $actor, FinancialForecast $forecast): FinancialForecast
    {
        $forecast->restore();

        AuditLog::create([
            'user_id' => $actor->id,
            'module' => 'Financial Forecasting',
            'action' => 'restore',
            'record_id' => $forecast->id,
            'activity_description' => "Restored {$forecast->forecast_type} forecast ({$forecast->forecast_no}).",
            'new_values' => null,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $forecast;
    }

    protected function generateForecastNo(): string
    {
        $next = FinancialForecast::withTrashed()->max('id') + 1;
        return 'FCST-' . str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }
}