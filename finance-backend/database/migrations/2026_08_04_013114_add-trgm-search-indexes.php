<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Speeds up the ILIKE '%term%' searches used by Customer::scopeSearch(),
     * Supplier::scopeSearch(), and Department::scopeSearch(). A normal
     * B-tree index can't be used for a leading-wildcard LIKE/ILIKE, so this
     * adds a GIN trigram index instead, which Postgres can use for
     * substring matches regardless of where the match falls in the string.
     */
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        DB::statement('CREATE INDEX customers_name_trgm_idx ON customers USING gin (customer_name gin_trgm_ops)');
        DB::statement('CREATE INDEX customers_email_trgm_idx ON customers USING gin (email gin_trgm_ops)');
        DB::statement('CREATE INDEX customers_contact_person_trgm_idx ON customers USING gin (contact_person gin_trgm_ops)');

        DB::statement('CREATE INDEX suppliers_name_trgm_idx ON suppliers USING gin (supplier_name gin_trgm_ops)');
        DB::statement('CREATE INDEX suppliers_email_trgm_idx ON suppliers USING gin (email gin_trgm_ops)');
        DB::statement('CREATE INDEX suppliers_contact_person_trgm_idx ON suppliers USING gin (contact_person gin_trgm_ops)');

        DB::statement('CREATE INDEX departments_name_trgm_idx ON departments USING gin (department_name gin_trgm_ops)');
        DB::statement('CREATE INDEX departments_description_trgm_idx ON departments USING gin (description gin_trgm_ops)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS customers_name_trgm_idx');
        DB::statement('DROP INDEX IF EXISTS customers_email_trgm_idx');
        DB::statement('DROP INDEX IF EXISTS customers_contact_person_trgm_idx');

        DB::statement('DROP INDEX IF EXISTS suppliers_name_trgm_idx');
        DB::statement('DROP INDEX IF EXISTS suppliers_email_trgm_idx');
        DB::statement('DROP INDEX IF EXISTS suppliers_contact_person_trgm_idx');

        DB::statement('DROP INDEX IF EXISTS departments_name_trgm_idx');
        DB::statement('DROP INDEX IF EXISTS departments_description_trgm_idx');

        // Not dropping the pg_trgm extension itself on rollback — other
        // parts of the schema may come to depend on it later, and
        // extensions are cheap to leave installed but disruptive to
        // drop out from under something else that started using it.
    }
};