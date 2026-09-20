<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Company-wide default AR penalty rate. Sits alongside the other
     * regional/financial defaults on the single settings row. New invoices
     * pre-fill from this value but can still override it per record.
     */
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->decimal('default_penalty_rate', 5, 2)
                ->default(0)
                ->after('default_tax_rate');
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn('default_penalty_rate');
        });
    }
};
