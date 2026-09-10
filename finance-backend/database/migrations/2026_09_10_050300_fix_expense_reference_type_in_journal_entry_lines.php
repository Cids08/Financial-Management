<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Fix journal_entry_lines.reference_type for Expense-sourced entries.
 *
 * Previously, ExpenseService::postJournalEntry() used `Expense::class`
 * (which resolves to the PHP FQCN "App\Models\Expense") instead of the
 * human-readable module label "Expenses" that the General Ledger frontend
 * uses for its REFERENCE_STYLES badge map.
 *
 * This migration updates all existing rows that have the old class-name
 * value to use the correct label so they display as the orange "Expenses"
 * badge in the General Ledger instead of the raw class string.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('journal_entry_lines')
            ->where('reference_type', 'App\\Models\\Expense')
            ->update(['reference_type' => 'Expenses']);
    }

    public function down(): void
    {
        DB::table('journal_entry_lines')
            ->where('reference_type', 'Expenses')
            ->update(['reference_type' => 'App\\Models\\Expense']);
    }
};

