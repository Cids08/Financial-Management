<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The original permissions table (2026_08_02_124200) only included:
 *   Administration, Accounts Receivable, Accounts Payable, Budget Management,
 *   Accounting, Forecasting, Reports, System Settings.
 *
 * This migration drops the CHECK constraint and re-creates it with the full
 * set of modules, including: Fixed Assets, Cash Accounts, Tax Obligations,
 * AI Recommendations, Disbursements, Expenses, Collections.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Drop the existing CHECK constraint added by the enum() call.
        // Laravel/PostgreSQL names it "<table>_<column>_check".
        DB::statement('ALTER TABLE permissions DROP CONSTRAINT IF EXISTS permissions_module_check');

        // Add an updated CHECK constraint with all modules.
        DB::statement("
            ALTER TABLE permissions
            ADD CONSTRAINT permissions_module_check
            CHECK (module IN (
                'Administration',
                'Accounts Receivable',
                'Accounts Payable',
                'Budget Management',
                'Accounting',
                'Forecasting',
                'Reports',
                'System Settings',
                'Fixed Assets',
                'Cash Accounts',
                'Tax Obligations',
                'AI Recommendations',
                'Disbursements',
                'Expenses',
                'Collections'
            ))
        ");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE permissions DROP CONSTRAINT IF EXISTS permissions_module_check');

        // Restore the original constraint
        DB::statement("
            ALTER TABLE permissions
            ADD CONSTRAINT permissions_module_check
            CHECK (module IN (
                'Administration',
                'Accounts Receivable',
                'Accounts Payable',
                'Budget Management',
                'Accounting',
                'Forecasting',
                'Reports',
                'System Settings'
            ))
        ");
    }
};

