<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Incorporates SAP Business One (SAP B1) Business Partner fields:
     * - Vendor/Supplier: Credit Limit (credit line granted by supplier), Payment Terms,
     *   Contract Reference (Blanket Agreement / Supply Contract), Contract Expiry, Category.
     * - Customer: Payment Terms, Contract Reference (Blanket Agreement / Rental Agreement), Contract Expiry.
     */
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            if (!Schema::hasColumn('suppliers', 'category')) {
                $table->string('category', 100)->nullable()->after('supplier_name');
            }
            if (!Schema::hasColumn('suppliers', 'credit_limit')) {
                $table->decimal('credit_limit', 15, 2)->default(0)->after('tin');
            }
            if (!Schema::hasColumn('suppliers', 'payment_terms')) {
                $table->string('payment_terms', 100)->nullable()->default('Net 30')->after('credit_limit');
            }
            if (!Schema::hasColumn('suppliers', 'contract_ref')) {
                $table->string('contract_ref', 100)->nullable()->after('payment_terms');
            }
            if (!Schema::hasColumn('suppliers', 'contract_expiry')) {
                $table->date('contract_expiry')->nullable()->after('contract_ref');
            }
        });

        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'payment_terms')) {
                $table->string('payment_terms', 100)->nullable()->default('Net 30')->after('credit_limit');
            }
            if (!Schema::hasColumn('customers', 'contract_ref')) {
                $table->string('contract_ref', 100)->nullable()->after('payment_terms');
            }
            if (!Schema::hasColumn('customers', 'contract_expiry')) {
                $table->date('contract_expiry')->nullable()->after('contract_ref');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $cols = [];
            foreach (['category', 'credit_limit', 'payment_terms', 'contract_ref', 'contract_expiry'] as $col) {
                if (Schema::hasColumn('suppliers', $col)) $cols[] = $col;
            }
            if (!empty($cols)) $table->dropColumn($cols);
        });

        Schema::table('customers', function (Blueprint $table) {
            $cols = [];
            foreach (['payment_terms', 'contract_ref', 'contract_expiry'] as $col) {
                if (Schema::hasColumn('customers', $col)) $cols[] = $col;
            }
            if (!empty($cols)) $table->dropColumn($cols);
        });
    }
};
