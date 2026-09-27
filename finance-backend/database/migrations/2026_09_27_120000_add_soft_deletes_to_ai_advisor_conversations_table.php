<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Archive = soft delete (row stays for audit; drops out of the
        // active list), same convention as ai_recommendations. Permanent
        // delete uses forceDelete() on the same column.
        Schema::table('ai_advisor_conversations', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('ai_advisor_conversations', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};