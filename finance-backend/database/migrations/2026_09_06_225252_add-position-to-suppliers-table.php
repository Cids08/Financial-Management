<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds `position` (the supplier's named contact person's job title) to
 * suppliers — mirrors the same field added to customers earlier.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('suppliers', 'position')) {
            Schema::table('suppliers', function (Blueprint $table) {
                $table->string('position')->nullable()->after('contact_person');
            });
        }
    }

    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn('position');
        });
    }
};