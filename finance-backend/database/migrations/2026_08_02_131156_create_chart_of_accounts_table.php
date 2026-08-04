<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chart_of_accounts', function (Blueprint $table) {

            $table->id();

            $table->string('account_code')->unique();

            $table->string('account_name');

            $table->enum('account_type',[
                'Asset',
                'Liability',
                'Equity',
                'Revenue',
                'Expense'
            ]);

            $table->string('account_category');

            $table->foreignId('parent_account_id')
                ->nullable()
                ->constrained('chart_of_accounts')
                ->nullOnDelete();

            $table->text('description')->nullable();

            $table->boolean('is_active')
                ->default(true);

            $table->timestamps();

            $table->softDeletes();

            $table->index('account_type');
            $table->index('account_category');

        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chart_of_accounts');
    }
};