<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the columns the existing frontend (AccountsReceivable.jsx) already
 * relies on but that aren't present in the current accounts_receivable
 * table per the ERD: payment_method, penalty_rate, penalty_amount, and
 * archive tracking (is_archived / archived_at / archived_by).
 *
 * Deliberately additive only — does not touch or remove any existing
 * column (paid_amount, remaining_balance, deleted_at, deleted_by, etc.),
 * so nothing already relying on the current schema breaks.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts_receivable', function (Blueprint $table) {
            $table->string('payment_method')->nullable()->after('remaining_balance');

            $table->decimal('penalty_rate', 5, 2)->default(0)->after('status');
            $table->decimal('penalty_amount', 15, 2)->default(0)->after('penalty_rate');

            $table->boolean('is_archived')->default(false)->after('deleted_by');
            $table->timestamp('archived_at')->nullable()->after('is_archived');
            $table->foreignId('archived_by')->nullable()->after('archived_at')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('accounts_receivable', function (Blueprint $table) {
            $table->dropConstrainedForeignId('archived_by');
            $table->dropColumn([
                'payment_method',
                'penalty_rate',
                'penalty_amount',
                'is_archived',
                'archived_at',
            ]);
        });
    }
};