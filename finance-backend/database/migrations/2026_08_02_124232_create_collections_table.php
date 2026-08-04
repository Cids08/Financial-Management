<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collections', function (Blueprint $table) {

            $table->id();

            $table->foreignId('ar_id')
                ->constrained('accounts_receivable')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreignId('collector_id')
                ->constrained()
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreignId('cash_account_id')
                ->constrained()
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->string('receipt_number')->unique();

            $table->string('or_number')->nullable();

            $table->date('collection_date');

            $table->date('deposit_date')->nullable();

            $table->decimal('amount_received',15,2);

            $table->enum('payment_method',[
                'Cash',
                'Bank Transfer',
                'Check',
                'GCash',
                'Maya'
            ]);

            $table->string('reference_number')->nullable();

            $table->enum('status',[
                'Pending',
                'Confirmed',
                'Cancelled'
            ])->default('Pending');

            $table->foreignId('received_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

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

        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collections');
    }
};