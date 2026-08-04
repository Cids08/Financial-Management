<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('budgets', function (Blueprint $table) {

            $table->id();

            $table->foreignId('department_id')
                ->constrained()
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->string('budget_code')->unique();

            $table->string('budget_name');

            $table->enum('budget_type', [
                'Operational',
                'Capital',
                'Project',
                'Emergency'
            ]);

            $table->year('fiscal_year');

            $table->decimal('allocated_amount', 15, 2);

            $table->decimal('used_amount', 15, 2)->default(0);

            $table->decimal('remaining_amount', 15, 2);

            $table->unsignedTinyInteger('warning_percentage')->default(80);

            $table->date('start_date');

            $table->date('end_date');

            $table->enum('status', [
                'Draft',
                'Active',
                'Closed',
                'Cancelled'
            ])->default('Draft');

            $table->foreignId('approved_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('approved_at')->nullable();

            $table->text('remarks')->nullable();

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

            $table->index('department_id');
            $table->index('budget_type');
            $table->index('status');
            $table->index('fiscal_year');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('budgets');
    }
};