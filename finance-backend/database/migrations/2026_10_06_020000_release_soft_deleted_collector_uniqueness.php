<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Lets a deleted collector's employee number (and login link) be reused.
 *
 * StoreCollectorRequest and UpdateCollectorRequest both guard employee_no with
 * Rule::unique(...)->whereNull('deleted_at'), so the FORM already treated a
 * soft-deleted collector as gone. The DATABASE disagreed: collectors.employee_no
 * was given a plain unique() index by 2026_08_04_045200_create_collectors_table,
 * so the soft-deleted row kept holding its number forever.
 *
 * The visible symptom in production: delete a collector, then try to create
 * another with the freed number in user management. The form said the number
 * was still taken (or the insert died on the raw constraint) while the
 * collector list showed nobody holding it — the number could never be reused,
 * and there was no row left to delete.
 *
 * collectors.user_id has the same hole from 2026_09_04_132721: one login could
 * not be linked to a new collector after its previous collector was archived,
 * because the archived row still owned the link.
 *
 * Both become partial indexes — uniqueness applies only to live rows — matching
 * the suppliers / reference-number pattern already in this repo
 * (2026_10_06_000000_add_unique_reference_indexes.php). The old full indexes
 * must be dropped, otherwise they keep rejecting the insert and the FormRequest
 * carve-out accomplishes nothing.
 *
 * dropUnique() rather than raw DROP INDEX: on Postgres these exist as UNIQUE
 * CONSTRAINTS, which cannot be dropped with DROP INDEX ("constraint requires
 * it"), while on SQLite they exist as plain indexes. The grammar picks the
 * right DDL for each driver.
 *
 * Safe on existing data: the old full index already proved active rows have
 * distinct employee_no and user_id, so the partial index only certifies a
 * subset of what is already true and cannot fail to build.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collectors', function (Blueprint $table) {
            $table->dropUnique('collectors_employee_no_unique');
            $table->dropUnique('collectors_user_id_unique');
        });

        DB::statement('CREATE UNIQUE INDEX collectors_employee_no_unique_active ON collectors (employee_no) WHERE deleted_at IS NULL');
        DB::statement('CREATE UNIQUE INDEX collectors_user_id_unique_active ON collectors (user_id) WHERE deleted_at IS NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS collectors_employee_no_unique_active');
        DB::statement('DROP INDEX IF EXISTS collectors_user_id_unique_active');

        // Restoring full uniqueness FAILS if any number or login link was
        // reused while the previous holder was soft-deleted — which is exactly
        // the data this migration exists to permit. Resolve any duplicates by
        // hand before rolling back; silently renaming a collector number to
        // satisfy a constraint would be worse than stopping.
        Schema::table('collectors', function (Blueprint $table) {
            $table->unique('employee_no');
            $table->unique('user_id');
        });
    }
};
