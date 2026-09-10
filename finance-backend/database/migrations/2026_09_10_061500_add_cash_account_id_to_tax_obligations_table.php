<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add cash_account_id to tax_obligations table so tax payments can be
 * linked directly to the bank or cash account from which BIR payments were remitted,
 * mirroring Expenses and Disbursements.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tax_obligations', function (Blueprint $table) {
            if (! Schema::hasColumn('tax_obligations', 'cash_account_id')) {
                $table->foreignId('cash_account_id')
                    ->nullable()
                    ->after('expense_id')
                    ->constrained('cash_accounts')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('tax_obligations', function (Blueprint $table) {
            if (Schema::hasColumn('tax_obligations', 'cash_account_id')) {
                $table->dropConstrainedForeignId('cash_account_id');
            }
        });
    }
};
