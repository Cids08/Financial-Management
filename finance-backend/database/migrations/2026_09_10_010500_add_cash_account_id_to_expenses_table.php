<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links expenses to a specific cash account so the approval journal entry
 * can credit the exact account the money came from and deduct its balance —
 * same pattern DisbursementService::releaseAp() uses for disbursements.
 *
 * expense_source is kept as nullable for historical records created before
 * this migration. New expenses use cash_account_id instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            if (! Schema::hasColumn('expenses', 'cash_account_id')) {
                $table->foreignId('cash_account_id')
                    ->nullable()
                    ->after('expense_source')
                    ->constrained('cash_accounts')
                    ->nullOnDelete();
            }

            // Make expense_source nullable now that cash_account_id carries the real link.
            // Existing rows keep their value; new rows will have it null.
            if (Schema::hasColumn('expenses', 'expense_source')) {
                $table->string('expense_source')->nullable()->change();
            }
        });
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cash_account_id');
            $table->string('expense_source')->nullable(false)->change();
        });
    }
};

