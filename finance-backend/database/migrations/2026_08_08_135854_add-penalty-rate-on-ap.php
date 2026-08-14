<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts_payable', function (Blueprint $table) {
            // Matches the numeric precision already used for rates/amounts
            // elsewhere on this table (original_amount, paid_amount, etc.
            // use numeric(15,2); penalty_rate is a percentage so it gets a
            // smaller precision, same pattern the AR frontend form implies).
            $table->decimal('penalty_rate', 5, 2)->default(0)->after('status');
            $table->decimal('penalty_amount', 15, 2)->default(0)->after('penalty_rate');
        });
    }

    public function down(): void
    {
        Schema::table('accounts_payable', function (Blueprint $table) {
            $table->dropColumn(['penalty_rate', 'penalty_amount']);
        });
    }
};