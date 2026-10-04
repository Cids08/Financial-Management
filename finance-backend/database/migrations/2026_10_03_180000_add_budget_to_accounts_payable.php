<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::table('accounts_payable', function (Blueprint $table) { $table->foreignId('budget_id')->nullable()->constrained('budgets')->restrictOnDelete(); }); }
    public function down(): void { Schema::table('accounts_payable', function (Blueprint $table) { $table->dropConstrainedForeignId('budget_id'); }); }
};
