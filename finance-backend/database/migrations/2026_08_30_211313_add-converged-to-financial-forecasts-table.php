<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds a column to record whether the Python forecast service's ARIMA
     * optimizer converged for a given forecast. Existing rows predate this
     * signal (the Python service always returned a fit with no convergence
     * diagnostics), so they default to true rather than being flagged as
     * unreliable retroactively.
     */
    public function up(): void
    {
        Schema::table('financial_forecasts', function (Blueprint $table) {
            $table->boolean('converged')
                ->default(true)
                ->after('model_version');
        });
    }

    public function down(): void
    {
        Schema::table('financial_forecasts', function (Blueprint $table) {
            $table->dropColumn('converged');
        });
    }
};