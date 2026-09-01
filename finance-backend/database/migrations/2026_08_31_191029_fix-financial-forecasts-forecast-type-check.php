<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The full, correct set of forecast types.
     * Original constraint only had: Cash Flow, Revenue, Collections,
     * Expenses, Accounts Receivable — missing Budget Utilization
     * and Disbursements, both of which are standard forecast targets
     * per the ARIMA forecasting service.
     */
    private array $forecastTypes = [
        'Cash Flow',
        'Revenue',
        'Collections',
        'Expenses',
        'Accounts Receivable',
        'Budget Utilization',
        'Disbursements',
    ];

    private array $previousForecastTypes = [
        'Cash Flow',
        'Revenue',
        'Collections',
        'Expenses',
        'Accounts Receivable',
    ];

    public function up(): void
    {
        DB::statement('
            ALTER TABLE financial_forecasts
            DROP CONSTRAINT financial_forecasts_forecast_type_check
        ');

        $list = collect($this->forecastTypes)
            ->map(fn ($type) => "'" . str_replace("'", "''", $type) . "'")
            ->implode(', ');

        DB::statement("
            ALTER TABLE financial_forecasts
            ADD CONSTRAINT financial_forecasts_forecast_type_check
            CHECK (forecast_type::text = ANY (ARRAY[{$list}]::text[]))
        ");
    }

    public function down(): void
    {
        DB::statement('
            ALTER TABLE financial_forecasts
            DROP CONSTRAINT financial_forecasts_forecast_type_check
        ');

        $list = collect($this->previousForecastTypes)
            ->map(fn ($type) => "'" . str_replace("'", "''", $type) . "'")
            ->implode(', ');

        DB::statement("
            ALTER TABLE financial_forecasts
            ADD CONSTRAINT financial_forecasts_forecast_type_check
            CHECK (forecast_type::text = ANY (ARRAY[{$list}]::text[]))
        ");
    }
};