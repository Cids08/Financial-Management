<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Stores the {label, historical, predicted} chart points computed at
     * generation time (ForecastEngine::buildSeries()). Without this, the
     * detail view would need to recompute the series later — which for a
     * real (non-mock) engine means re-fetching historical actuals for
     * "today minus lookback_months," a window that has already drifted
     * away from what the forecast actually trained on by the time anyone
     * opens the detail view. Storing it once, at generation, makes the
     * chart a permanent record of what was actually generated.
     */
    public function up(): void
    {
        Schema::table('financial_forecasts', function (Blueprint $table) {
            $table->jsonb('series')
                ->nullable()
                ->after('rmse')
                ->comment('Chart points captured at generation time: [{label, historical, predicted}, ...]');
        });
    }

    public function down(): void
    {
        Schema::table('financial_forecasts', function (Blueprint $table) {
            $table->dropColumn('series');
        });
    }
};