<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Data-repair migration (v2).
 *
 * The original consolidation migration merged by "highest id wins" per
 * column, which was correct only while Setting::current() was still
 * forking new rows (each new save = a new, higher id = more recent).
 *
 * Once current() was fixed to `orderBy('id')->first()`, all saves started
 * landing on the LOWEST id instead — so id ordering no longer reflects
 * recency at all. This version merges by each row's actual `updated_at`
 * timestamp instead, so it's correct regardless of which id ended up
 * being touched most recently.
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

            if ($rows->count() <= 1) {
                return; // Already consolidated, nothing to do.
            }

            // Sort by updated_at (most recent first) — NOT by id — since id
            // no longer correlates with recency after the current() fix.
            $byRecency = $rows->sortByDesc('updated_at')->values();

            $merged = [];
            foreach ($this->columns as $column) {
                $latest = $byRecency->first(fn ($row) => $row->$column !== null);
                $merged[$column] = $latest?->$column;
            }

            // Keep the row with the lowest id as the surviving row, since
            // that's what Setting::current() will resolve to going forward.
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