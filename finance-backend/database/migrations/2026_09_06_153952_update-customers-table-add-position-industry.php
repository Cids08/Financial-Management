<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds `position` (the named contact person's job title) and `industry`
 * ("Industry/Business Type") to customers.
 *
 * `tin` is deliberately LEFT IN PLACE, not dropped — BIR audit requires
 * TIN on invoices, so the column stays available for that later even
 * though nothing in the app currently reads/writes it (not implemented
 * yet, per confirmation). Model/requests/resource/form all still omit
 * `tin` for now; only this migration's shape changed from the earlier
 * drop-tin version.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('position')->nullable()->after('contact_person');
            $table->string('industry')->nullable()->after('address');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['position', 'industry']);
        });
    }
};