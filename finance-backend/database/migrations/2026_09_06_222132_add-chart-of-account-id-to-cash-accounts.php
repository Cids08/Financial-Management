<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Replaces config('accounting.accounts.cash_account_map') — a
     * per-cash-account mapping that had to be hand-edited in a config
     * file every time a new cash account was created. Each cash account
     * now carries its own GL account directly, set once when the account
     * is created/edited, same as any other field on it.
     */
    public function up(): void
    {
        Schema::table('cash_accounts', function (Blueprint $table) {
            $table->foreignId('chart_of_account_id')
                ->nullable()
                ->after('id')
                ->constrained('chart_of_accounts')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('cash_accounts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('chart_of_account_id');
        });
    }
};