<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            $table->string('source_type', 20)->default('ap')->after('id');
            $table->string('payroll_batch_number', 50)->nullable()->after('voucher_number');
            $table->date('pay_period_start')->nullable()->after('payroll_batch_number');
            $table->date('pay_period_end')->nullable()->after('pay_period_start');
            $table->unsignedInteger('employee_count')->nullable()->after('pay_period_end');
        });

        // A payroll-sourced disbursement has no linked payable, so ap_id
        // must allow null. This requires doctrine/dbal if you're on an
        // older Laravel — Laravel 12 ships native column-change support,
        // so this should work as-is.
        Schema::table('disbursements', function (Blueprint $table) {
            $table->foreignId('ap_id')->nullable()->change();
        });

        // Cheap guard against garbage values — matches the two source
        // types the frontend/service actually branch on.
        DB::statement("ALTER TABLE disbursements ADD CONSTRAINT disbursements_source_type_check CHECK (source_type IN ('ap', 'payroll'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE disbursements DROP CONSTRAINT IF EXISTS disbursements_source_type_check');

        Schema::table('disbursements', function (Blueprint $table) {
            $table->dropColumn(['source_type', 'payroll_batch_number', 'pay_period_start', 'pay_period_end', 'employee_count']);
        });

        Schema::table('disbursements', function (Blueprint $table) {
            $table->foreignId('ap_id')->nullable(false)->change();
        });
    }
};