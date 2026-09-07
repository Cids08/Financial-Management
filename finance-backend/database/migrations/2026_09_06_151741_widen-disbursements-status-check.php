<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The original constraint only allowed Pending/Released/Cancelled,
     * which meant DisbursementService::approve() and reject() could never
     * actually succeed against a real row — every disbursement needs an
     * admin approval step before release, so Approved and Rejected have
     * to be valid statuses. Cancelled is left in place since nothing
     * indicates it's safe to drop.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE disbursements DROP CONSTRAINT IF EXISTS disbursements_status_check');

        DB::statement(
            "ALTER TABLE disbursements ADD CONSTRAINT disbursements_status_check
             CHECK (status IN ('Pending', 'Approved', 'Released', 'Rejected', 'Cancelled'))"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE disbursements DROP CONSTRAINT disbursements_status_check');

        DB::statement(
            "ALTER TABLE disbursements ADD CONSTRAINT disbursements_status_check
             CHECK (status IN ('Pending', 'Released', 'Cancelled'))"
        );
    }
};