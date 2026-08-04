<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_entry_lines', function (Blueprint $table) {

            $table->id();

            $table->foreignId('journal_entry_id')
                ->constrained()
                ->cascadeOnDelete();

            $table->foreignId('account_id')
                ->constrained('chart_of_accounts')
                ->restrictOnDelete();

            $table->decimal('debit',15,2)
                ->default(0);

            $table->decimal('credit',15,2)
                ->default(0);

            $table->string('reference_type')
                ->nullable();

            $table->unsignedBigInteger('reference_id')
                ->nullable();

            $table->text('remarks')
                ->nullable();

            $table->timestamps();

            $table->index('account_id');

        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_entry_lines');
    }
};