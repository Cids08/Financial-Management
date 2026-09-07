<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds the expense/asset account a bill should debit when its journal
     * entry is posted on approval (Dr <this account> / Cr Accounts Payable).
     * Nullable at the DB level so existing rows aren't broken by this
     * migration — enforced as required going forward via the FormRequest
     * validation instead, same pattern the rest of this module already
     * uses (e.g. required-in-app, not required-in-schema).
     */
    public function up(): void
    {
        if (! Schema::hasColumn('accounts_payable', 'account_id')) {
            Schema::table('accounts_payable', function (Blueprint $table) {
                $table->foreignId('account_id')
                    ->nullable()
                    ->after('supplier_id')
                    ->constrained('chart_of_accounts')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::table('accounts_payable', function (Blueprint $table) {
            $table->dropConstrainedForeignId('account_id');
        });
    }
};