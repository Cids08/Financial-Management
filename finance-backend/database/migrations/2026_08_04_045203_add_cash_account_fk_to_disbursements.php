<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the cash_account_id FK constraint to disbursements (deferred from
 * 2026_08_02_124234 because cash_accounts is created in 2026_08_04_045201).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            // Only add the constraint if it doesn't already exist
            if (Schema::hasColumn('disbursements', 'cash_account_id')) {
                $table->foreign('cash_account_id')
                    ->references('id')
                    ->on('cash_accounts')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            $table->dropForeign(['cash_account_id']);
        });
    }
};

