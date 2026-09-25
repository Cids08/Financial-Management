<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Supplier default expanded withholding classification.
     *
     * One of Goods / Services (BIR EWT at source: 1% on goods payments
     * (WC100), 2% on services (WC157)). DisbursementService uses this to
     * determine the withholding rate when a supplier is paid — the amount
     * is retained from the payout and remitted to the BIR. Null lets the
     * system fall back to its remarks/payee heuristic.
     */
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('default_withholding_type', 20)->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn('default_withholding_type');
        });
    }
};