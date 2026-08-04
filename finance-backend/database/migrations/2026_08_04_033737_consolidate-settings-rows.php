<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Data-repair migration.
 *
 * Setting::current() previously used firstOrCreate(['id' => 1], [...]).
 * Once the row with id = 1 was ever deleted (e.g. during testing), Postgres'
 * sequence had already advanced past 1, so every subsequent call created a
 * brand-new row instead of finding the existing one. The result: dozens of
 * "settings" rows, each holding only whatever fields were saved in that one
 * request, with everything else back at defaults (null / "Laravel").
 *
 * This migration merges all existing rows back into one: for each column,
 * it takes the value from the highest-id row where that column is non-null
 * (i.e. the most recent save that actually set it), keeps the earliest row
 * as the surviving id, applies the merged values to it, and deletes the rest.
 *
 * Not reversible — this is a one-time cleanup, not a schema change.
 */
return new class extends Migration
{
    protected array $columns = [
        'company_name',
        'tagline',
        'company_address',
        'company_email',
        'company_phone',
        'company_logo',
        'currency',
        'fiscal_year',
        'default_tax_rate',
        'forecast_months',
    ];

    public function up(): void
    {
        DB::transaction(function () {
            $rows = DB::table('settings')->orderBy('id')->get();

            if ($rows->isEmpty()) {
                return;
            }

            if ($rows->count() === 1) {
                return; // Already consolidated, nothing to do.
            }

            $merged = [];
            foreach ($this->columns as $column) {
                // Most recent row (highest id) that has a non-null value
                // for this specific column wins.
                $latest = $rows->sortByDesc('id')->first(
                    fn ($row) => $row->$column !== null
                );
                $merged[$column] = $latest?->$column;
            }

            $keepId = $rows->first()->id;

            DB::table('settings')
                ->where('id', $keepId)
                ->update($merged + ['updated_at' => now()]);

            DB::table('settings')
                ->where('id', '!=', $keepId)
                ->delete();
        });
    }

    public function down(): void
    {
        // Not reversible — original per-row data is gone once merged.
    }
};