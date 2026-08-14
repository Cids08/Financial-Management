<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A structured area/zone table — needed because collectors.assigned_area
        // and customers.address are both free text today, which makes
        // "does this collector cover this customer's location" unreliable
        // to check in code (string matching on addresses).
        Schema::create('service_areas', function (Blueprint $table) {
            $table->id();
            $table->string('name');       // e.g. "Quezon City - North"
            $table->string('code')->unique(); // e.g. "QC-N"
            $table->timestamps(0);
        });

        // Link collectors to a real service area instead of relying on
        // free text alone. assigned_area (varchar) is left in place —
        // still useful as a human-readable label/fallback — this just adds
        // the structured reference next to it.
        Schema::table('collectors', function (Blueprint $table) {
            $table->foreignId('service_area_id')->nullable()->after('assigned_area')
                ->constrained('service_areas')->nullOnDelete();
        });

        // Same structured reference on customers, so a customer's invoices
        // can be matched to the collector(s) covering that area.
        Schema::table('customers', function (Blueprint $table) {
            $table->foreignId('service_area_id')->nullable()->after('address')
                ->constrained('service_areas')->nullOnDelete();
        });

        // THE ACTUAL GAP: accounts_receivable has no collector_id today, so
        // there is currently no way to say "this invoice belongs to this
        // collector" — collections.collector_id only records who collected
        // a payment after it happened, it can't restrict who's allowed to
        // collect it beforehand. This is what makes "collector should only
        // collect specific receipts" enforceable.
        Schema::table('accounts_receivable', function (Blueprint $table) {
            $table->foreignId('collector_id')->nullable()->after('customer_id')
                ->constrained('collectors')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('accounts_receivable', function (Blueprint $table) {
            $table->dropConstrainedForeignId('collector_id');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('service_area_id');
        });

        Schema::table('collectors', function (Blueprint $table) {
            $table->dropConstrainedForeignId('service_area_id');
        });

        Schema::dropIfExists('service_areas');
    }
};