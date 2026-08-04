<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_entries', function (Blueprint $table) {

            $table->id();

            $table->string('transaction_no')->unique();

            $table->date('transaction_date');

            $table->text('description');

            $table->enum('status',[
                'Draft',
                'Posted',
                'Cancelled'
            ])->default('Draft');

            $table->foreignId('posted_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('posted_at')->nullable();

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

            $table->index('transaction_date');
            $table->index('status');

        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_entries');
    }
};