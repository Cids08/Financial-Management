<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('expenses', 'rejection_remarks')) {
            Schema::table('expenses', function (Blueprint $table) {
                // Previously the reject() flow appended the rejection reason
                // directly onto the `description` field, permanently mutating
                // the original record. This column keeps it separate so
                // `description` stays exactly what the filer wrote.
                $table->string('rejection_remarks', 500)->nullable()->after('status');
            });
        }
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropColumn('rejection_remarks');
        });
    }
};