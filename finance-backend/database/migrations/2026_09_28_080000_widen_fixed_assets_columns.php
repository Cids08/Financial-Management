<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('fixed_assets')) {
            return;
        }

        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_asset_category_check');
            DB::statement('ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_status_check');
            DB::statement('ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_depreciation_method_check');
            DB::statement('ALTER TABLE fixed_assets ALTER COLUMN asset_category TYPE VARCHAR(100)');
            DB::statement('ALTER TABLE fixed_assets ALTER COLUMN status TYPE VARCHAR(50)');
            DB::statement('ALTER TABLE fixed_assets ALTER COLUMN depreciation_method TYPE VARCHAR(50)');
            DB::statement('ALTER TABLE fixed_assets ALTER COLUMN created_by DROP NOT NULL');
        } elseif ($driver === 'mysql') {
            DB::statement('ALTER TABLE fixed_assets MODIFY asset_category VARCHAR(100) NOT NULL');
            DB::statement("ALTER TABLE fixed_assets MODIFY status VARCHAR(50) NOT NULL DEFAULT 'Active'");
            DB::statement("ALTER TABLE fixed_assets MODIFY depreciation_method VARCHAR(50) NOT NULL DEFAULT 'Straight Line'");
            DB::statement('ALTER TABLE fixed_assets MODIFY created_by BIGINT UNSIGNED NULL');
        } else {
            Schema::table('fixed_assets', function (Blueprint $table) {
                $table->string('asset_category', 100)->change();
                $table->string('status', 50)->default('Active')->change();
                $table->string('depreciation_method', 50)->default('Straight Line')->change();
                $table->foreignId('created_by')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        // Non-destructive down method
    }
};
