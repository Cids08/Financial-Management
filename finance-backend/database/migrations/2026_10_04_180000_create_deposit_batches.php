<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::create('deposit_batches', function (Blueprint $t) {
            $t->id(); $t->string('batch_number')->unique();
            $t->foreignId('cash_account_id')->constrained('cash_accounts')->restrictOnDelete();
            $t->date('deposit_date'); $t->string('bank_reference', 150); $t->decimal('deposit_amount',15,2);
            $t->decimal('receipt_total',15,2); $t->json('receipt_snapshot');
            $t->string('status')->default('Pending');
            $t->foreignId('prepared_by')->constrained('users')->restrictOnDelete();
            $t->foreignId('confirmed_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->timestamp('confirmed_at')->nullable(); $t->text('cancellation_reason')->nullable();
            $t->timestamps(); $t->index(['cash_account_id','bank_reference']);
        });
        Schema::create('deposit_batch_items', function (Blueprint $t) {
            $t->id(); $t->foreignId('deposit_batch_id')->constrained('deposit_batches')->restrictOnDelete();
            $t->foreignId('collection_id')->unique()->constrained('collections')->restrictOnDelete();
        });
    }
    public function down(): void { Schema::dropIfExists('deposit_batch_items'); Schema::dropIfExists('deposit_batches'); }
};
