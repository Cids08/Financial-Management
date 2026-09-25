<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Company Tax Identification Number (TIN) used as the payor TIN on
     * official BIR forms (Form 2307). Configurable in Settings instead of
     * hardcoded so the certificate reflects the real registered entity.
     */
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->string('company_tin', 30)->nullable()->after('company_phone');
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn('company_tin');
        });
    }
};