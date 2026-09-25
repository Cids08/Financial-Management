<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pins the AR control account on the settings row by account_id instead
     * of by name, so "Accounts Receivable" can be renamed freely without
     * breaking collection/AR posting. Backfills the column from the legacy
     * name lookup on existing databases.
     */
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->unsignedBigInteger('ar_control_account_id')
                ->nullable()
                ->after('default_penalty_rate')
                ->constrained('chart_of_accounts')
                ->nullOnDelete();
        });

        $arId = DB::table('chart_of_accounts')
            ->where('account_name', 'Accounts Receivable')
            ->value('id');

        if ($arId) {
            DB::table('settings')->update(['ar_control_account_id' => $arId]);
        }
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ar_control_account_id');
        });
    }
};