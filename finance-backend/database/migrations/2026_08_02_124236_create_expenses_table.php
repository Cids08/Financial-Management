<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {

            $table->id();

            $table->foreignId('budget_id')
                ->constrained()
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreignId('expense_category_id')
                ->constrained()
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreignId('supplier_id')
                ->nullable()
                ->constrained()
                ->nullOnDelete();

            $table->date('expense_date');

            $table->string('receipt_number')->nullable();

            $table->decimal('expense_amount', 15, 2);

            $table->enum('expense_source', [
                'Cash',
                'Bank',
                'Petty Cash'
            ]);

            $table->enum('receipt_status', [
                'Uploaded',
                'Missing',
                'Pending'
            ])->default('Pending');

            $table->text('description');

            $table->boolean('is_over_budget')->default(false);

            $table->enum('status', [
                'Pending',
                'Approved',
                'Rejected',
                'Cancelled'
            ])->default('Pending');

            $table->foreignId('created_by')
                ->constrained('users')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->timestamps();

            $table->softDeletes();

            $table->foreignId('deleted_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->index('budget_id');
            $table->index('expense_category_id');
            $table->index('expense_date');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};