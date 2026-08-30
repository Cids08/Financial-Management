<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Drops the DB-level enum-style check constraint on budget_type.
        // It was blocking budget creation with an opaque SQLSTATE[23514]
        // error and no readable message about which values it actually
        // allowed. Validation for budget_type now lives in
        // StoreBudgetRequest instead, where a failed value returns a
        // normal, readable 422 validation error.
        DB::statement('ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_budget_type_check');
    }

    public function down(): void
    {
        // Not restored — the constraint's original allowed values were
        // never confirmed, so there's nothing safe to recreate here. If
        // you need it back, redefine it explicitly with your real list:
        // DB::statement("ALTER TABLE budgets ADD CONSTRAINT budgets_budget_type_check CHECK (budget_type IN ('Operating', 'Capital', ...))");
    }
};