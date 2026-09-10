<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Backfills approved_by and approved_at for budgets that are Active
     * but had approved_by/approved_at set to null due to mass-assignment
     * omission prior to fixing $fillable on Budget model.
     */
    public function up(): void
    {
        DB::table('budgets')
            ->where('status', 'Active')
            ->whereNull('approved_by')
            ->update([
                'approved_by' => DB::raw('created_by'),
                'approved_at' => DB::raw('updated_at'),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op: data backfill does not require rolling back
    }
};

