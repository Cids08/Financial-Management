<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * A real DB sequence, not a locked MAX(voucher_number) read — Postgres
     * doesn't allow FOR UPDATE on an aggregate query, and locking just the
     * "last" row by id doesn't actually serialize two concurrent inserts
     * under READ COMMITTED (a second transaction blocked on that row's
     * lock re-reads the same old row once unblocked, not any row inserted
     * meanwhile — so both could compute the same "next" number). A native
     * sequence's nextval() is atomic with no locking needed. A number is
     * never reused even if the transaction that pulled it later rolls
     * back — a gap is fine for a voucher number, a duplicate is not.
     */
    public function up(): void
    {
        DB::statement('CREATE SEQUENCE IF NOT EXISTS disbursement_voucher_seq START WITH 1');

        // Seed the sequence past any voucher numbers already in the table
        // (e.g. ones entered manually before this migration ran), so the
        // first auto-generated number can't collide with an existing one.
        // Matches the 'DV-0001' style format — pulls the numeric part out
        // of every existing voucher_number, regardless of padding width.
        DB::statement(<<<SQL
            SELECT setval(
                'disbursement_voucher_seq',
                GREATEST(
                    1,
                    COALESCE(
                        (
                            SELECT MAX(CAST(SUBSTRING(voucher_number FROM 'DV-(\d+)') AS INTEGER))
                            FROM disbursements
                            WHERE voucher_number ~ '^DV-\d+$'
                        ),
                        0
                    ) + 1
                ),
                false
            )
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP SEQUENCE IF EXISTS disbursement_voucher_seq');
    }
};