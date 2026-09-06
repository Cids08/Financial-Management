<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * financial_forecasts.mape and .rmse are currently decimal(8,4) — max
 * absolute value 9999.9999. Real ARIMA output blows past that:
 *
 *   - mape (Mean Absolute Percentage Error) spikes well past 9999% when
 *     historical actuals include near-zero months (division-by-small-
 *     number blowup) — seen at 26225.8923 on a real Accounts Receivable
 *     yearly forecast.
 *   - rmse (Root Mean Squared Error) is in the SAME UNITS as the
 *     forecasted amount, not a percentage — for a company forecasting
 *     millions in AR/cash flow, rmse can legitimately be in the hundreds
 *     of millions. Seen at 188663245.603 on the same forecast.
 *
 * This is a real overflow bug (SQLSTATE 22003 numeric field overflow),
 * not a data-quality issue to catch/reject in code — both values are
 * genuine model output that the schema was simply never sized for.
 *
 * mape -> numeric(12,4): max ~99,999,999.9999, keeps 4-decimal precision
 * for the more typical small values while covering realistic blowups.
 *
 * rmse -> numeric(15,4): max ~99,999,999,999.9999 (99.9 billion), ample
 * headroom above the observed ~189 million for a construction company's
 * scale, while keeping the same decimal precision the column already had.
 *
 * Raw SQL rather than Schema::table()->change(), which requires the
 * doctrine/dbal package for column-type alterations and is finicky with
 * numeric precision/scale changes specifically on some DBAL versions.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE financial_forecasts ALTER COLUMN mape TYPE numeric(12,4)');
        DB::statement('ALTER TABLE financial_forecasts ALTER COLUMN rmse TYPE numeric(15,4)');
    }

    public function down(): void
    {
        // Reverts to the original decimal(8,4) — NOTE: if any rows were
        // inserted while the widened precision was in effect and their
        // mape/rmse exceed 9999.9999, rolling back this migration will
        // itself throw the same numeric overflow error on those existing
        // rows. Widening a column is safe to roll forward; rolling this
        // particular migration back is not guaranteed to be safe once
        // real data has landed in the wider range.
        DB::statement('ALTER TABLE financial_forecasts ALTER COLUMN mape TYPE numeric(8,4)');
        DB::statement('ALTER TABLE financial_forecasts ALTER COLUMN rmse TYPE numeric(8,4)');
    }
};