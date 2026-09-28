<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE accounts_receivable DROP CONSTRAINT IF EXISTS accounts_receivables_status_check');
        DB::statement('ALTER TABLE accounts_receivable DROP CONSTRAINT IF EXISTS accounts_receivable_status_check');
        DB::statement(
            "ALTER TABLE accounts_receivable ADD CONSTRAINT accounts_receivable_status_check
             CHECK (status IN ('Pending', 'For Collection', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'))"
        );

        DB::statement('ALTER TABLE accounts_payable DROP CONSTRAINT IF EXISTS accounts_payables_status_check');
        DB::statement('ALTER TABLE accounts_payable DROP CONSTRAINT IF EXISTS accounts_payable_status_check');
        DB::statement(
            "ALTER TABLE accounts_payable ADD CONSTRAINT accounts_payable_status_check
             CHECK (status IN ('Pending', 'Pending Approval', 'For Payment', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'))"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE accounts_receivable DROP CONSTRAINT IF EXISTS accounts_receivable_status_check');
        DB::statement(
            "ALTER TABLE accounts_receivable ADD CONSTRAINT accounts_receivable_status_check
             CHECK (status IN ('Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'))"
        );

        DB::statement('ALTER TABLE accounts_payable DROP CONSTRAINT IF EXISTS accounts_payable_status_check');
        DB::statement(
            "ALTER TABLE accounts_payable ADD CONSTRAINT accounts_payable_status_check
             CHECK (status IN ('Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'))"
        );
    }
};
