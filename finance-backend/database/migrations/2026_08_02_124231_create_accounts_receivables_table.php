<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounts_receivable', function (Blueprint $table) {

            $table->id();

            $table->foreignId('customer_id')
                ->constrained()
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->string('invoice_number')->unique();

            $table->date('invoice_date');

            $table->date('due_date');

            $table->decimal('original_amount',15,2);

            $table->decimal('paid_amount',15,2)->default(0);

            $table->decimal('remaining_balance',15,2);

            $table->string('payment_terms')->nullable();

            $table->string('purchase_order_no')->nullable();

            $table->string('reference_no')->nullable();

            $table->text('remarks')->nullable();

            $table->enum('status',[
                'Pending',
                'Partially Paid',
                'Paid',
                'Overdue',
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

        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounts_receivable');
    }
};