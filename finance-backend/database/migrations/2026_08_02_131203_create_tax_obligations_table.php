<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tax_obligations', function (Blueprint $table) {

            $table->id();

            $table->string('tax_type');

            $table->string('tax_period');

            $table->decimal('tax_rate',5,2);

            $table->decimal('taxable_amount',15,2);

            $table->decimal('tax_amount',15,2);

            $table->date('due_date');

            $table->date('payment_date')->nullable();

            $table->string('reference_number')->nullable();

            $table->enum('status',[
                'Pending',
                'Paid',
                'Overdue'
            ])->default('Pending');

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

            $table->index('tax_type');
            $table->index('status');
            $table->index('due_date');

        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tax_obligations');
    }
};