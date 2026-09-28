<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add data_retention_days to settings table.
     * Required for corporate data retention policy (e.g. BIR 10-year / 3650 days rule).
     */
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            if (! Schema::hasColumn('settings', 'data_retention_days')) {
                $table->unsignedInteger('data_retention_days')->default(3650)->after('forecast_months');
            }
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            if (Schema::hasColumn('settings', 'data_retention_days')) {
                $table->dropColumn('data_retention_days');
            }
        });
    }
};
