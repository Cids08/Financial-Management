<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Partial unique index mirroring StoreSupplierRequest's email rule
     * (Rule::unique('suppliers', 'email')->whereNull('deleted_at')): an
     * email must be unique among non-archived suppliers, and a recycled
     * archived supplier may hand its email on. PostgreSQL allows multiple
     * NULL emails in the partial index too, so the nullable email column
     * stays compatible.
     *
     * Fails loudly (constraint error) if duplicate non-archived emails
     * already exist in the data  -  clean those up before running the
     * migration, then re-run.
     */
    public function up(): void
    {
        DB::statement(
            'CREATE UNIQUE INDEX suppliers_email_unique_active ON suppliers (email) WHERE email IS NOT NULL AND deleted_at IS NULL'
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS suppliers_email_unique_active');
    }
};