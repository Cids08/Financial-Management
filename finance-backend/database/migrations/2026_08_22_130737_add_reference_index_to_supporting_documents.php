<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
// database/migrations/xxxx_xx_xx_add_reference_index_to_supporting_documents.php
    public function up(): void
    {
        Schema::table('supporting_documents', function (Blueprint $table) {
            $table->index(['reference_type', 'reference_id'], 'supporting_documents_reference_index');
        });
    }

    public function down(): void
    {
        Schema::table('supporting_documents', function (Blueprint $table) {
            $table->dropIndex('supporting_documents_reference_index');
        });
    }
};
