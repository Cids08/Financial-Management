<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supporting_documents', function (Blueprint $table) {

            $table->id();

            $table->string('reference_type');

            $table->unsignedBigInteger('reference_id');

            $table->string('file_name');

            $table->string('original_name');

            $table->string('storage_path');

            $table->string('mime_type');

            $table->unsignedBigInteger('file_size');

            $table->foreignId('uploaded_by')
                ->constrained('users')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->timestamp('uploaded_at');

            $table->timestamps();

            $table->index(['reference_type','reference_id']);

        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supporting_documents');
    }
};