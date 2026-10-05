<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Enforces the business reference numbers at the DATABASE level.
 *
 * accounts_receivable.reference_no, accounts_payable.reference_number,
 * collections.reference_number and disbursements.reference_number are all
 * auto-generated (REF-AR-###, REF-AP-###, REF-COL-###, REF-DIS-###) and are
 * already guarded by a `Rule::unique(...)` in the matching FormRequest — but a
 * FormRequest check is a read-then-write with no lock, so two concurrent
 * creates both read "the last one is 008", both decide on 009, and both insert.
 * The generated value then appears on two different documents, which breaks
 * every audit trail that resolves a ledger line back to its source via
 * (reference_type, reference_id) → reference number.
 *
 * These partial unique indexes are the actual guarantee; the advisory lock in
 * each generateReference*() helper merely makes the common path collision-free
 * so the user never sees a 500.
 *
 * Mirrors the suppliers pattern (2026_09_21_000001): uniqueness applies to
 * non-archived rows only, so an archived record's number can be handed on, and
 * multiple NULLs stay legal.
 *
 * NOTE: this migration fails loudly if duplicates already exist among active
 * rows, because silently rewriting business reference numbers is worse than
 * stopping. Find them first with, per table/column:
 *
 *   SELECT <col>, COUNT(*) FROM <table>
 *   WHERE <col> IS NOT NULL AND deleted_at IS NULL
 *   GROUP BY <col> HAVING COUNT(*) > 1;
 *
 * Tables and columns:
 *   accounts_receivable.reference_no
 *   accounts_payable.reference_number
 *   collections.reference_number
 *   disbursements.reference_number
 *
 * ORDERING: this file is deliberately timestamped AFTER
 * 2026_10_05_230000_add_collection_posting_stages.php. Laravel runs pending
 * migrations in filename order and aborts the whole batch on the first
 * failure, so a pre-existing duplicate reference would otherwise stop the
 * collection-posting migration from running too - leaving the Collections
 * code querying receipt_journal_entry_id against a column that does not yet
 * exist. The two features are unrelated, so neither should be able to block
 * the other. Keep this file last unless both are already applied.
 */
return new class extends Migration
{
    /**
     * table => [column, index name].
     */
    private const INDEXES = [
        'accounts_receivable' => ['reference_no', 'accounts_receivable_reference_no_unique_active'],
        'accounts_payable'    => ['reference_number', 'accounts_payable_reference_number_unique_active'],
        'collections'         => ['reference_number', 'collections_reference_number_unique_active'],
        'disbursements'       => ['reference_number', 'disbursements_reference_number_unique_active'],
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $table => [$column, $index]) {
            DB::statement(sprintf(
                'CREATE UNIQUE INDEX %s ON %s (%s) WHERE %s IS NOT NULL AND deleted_at IS NULL',
                $index,
                $table,
                $column,
                $column
            ));
        }
    }

    public function down(): void
    {
        foreach (self::INDEXES as [, [, $index]]) {
            DB::statement(sprintf('DROP INDEX IF EXISTS %s', $index));
        }
    }
};