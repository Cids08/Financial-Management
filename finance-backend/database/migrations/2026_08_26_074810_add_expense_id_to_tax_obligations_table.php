<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tax_obligations', function (Blueprint $table) {
            $table->foreignId('expense_id')
                ->nullable()
                ->after('reference_number')
                ->constrained('expenses')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tax_obligations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('expense_id');
        });
    }
};