<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add Expanded Withholding Tax (EWT) fields to disbursements.
     *
     * Amount semantics (Philippine EWT — see DisbursementService::releaseAp):
     *   - amount_paid stays the FULL gross bill amount (this is what settles
     *     the Accounts Payable liability).
     *   - ewt_amount is the creditable tax withheld at source (1% goods /
     *     2% services by default), which is retained from the cash payout and
     *     accrued as an EWT Payable liability until remitted to the BIR.
     *   - net_amount is what actually leaves the cash account = amount_paid
     *     minus ewt_amount.
     *
     * These are written once, atomically, at release time inside the same
     * DB transaction that deducts cash and posts the journal entry, so the
     * voucher, BIR 2307 certificate, and ledger all stay consistent.
     */
    public function up(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            $table->decimal('ewt_rate', 5, 2)->nullable()->after('amount_paid');
            $table->string('ewt_atc_code', 20)->nullable()->after('ewt_rate');
            $table->decimal('ewt_amount', 15, 2)->default(0)->after('ewt_atc_code');
            $table->decimal('net_amount', 15, 2)->nullable()->after('ewt_amount');
        });
    }

    public function down(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            $table->dropColumn(['ewt_rate', 'ewt_atc_code', 'ewt_amount', 'net_amount']);
        });
    }
};