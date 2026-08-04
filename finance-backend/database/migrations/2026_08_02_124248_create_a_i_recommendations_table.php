<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('ai_recommendations', function (Blueprint $table) {

            /*
            |--------------------------------------------------------------------------
            | Primary Key
            |--------------------------------------------------------------------------
            */

            $table->id();

            /*
            |--------------------------------------------------------------------------
            | Relationships
            |--------------------------------------------------------------------------
            */

            $table->foreignId('forecast_id')
                ->constrained('financial_forecasts')
                ->cascadeOnDelete();

            /*
            |--------------------------------------------------------------------------
            | Recommendation Information
            |--------------------------------------------------------------------------
            */

            $table->enum('category', [
                'Revenue',
                'Expense',
                'Cash Flow',
                'Budget'
            ]);

            $table->enum('priority', [
                'Low',
                'Medium',
                'High',
                'Critical'
            ]);

            $table->text('summary');

            $table->longText('recommendation');

            /*
            |--------------------------------------------------------------------------
            | AI Metrics
            |--------------------------------------------------------------------------
            */

            $table->decimal('confidence_score', 5, 2);

            $table->decimal('estimated_impact', 15, 2)->nullable();

            /*
            |--------------------------------------------------------------------------
            | Audit
            |--------------------------------------------------------------------------
            */

            $table->foreignId('generated_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->foreignId('updated_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('generated_at');

            $table->timestamps();

            $table->softDeletes();

            $table->foreignId('deleted_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            /*
            |--------------------------------------------------------------------------
            | Indexes
            |--------------------------------------------------------------------------
            */

            $table->index('forecast_id');
            $table->index('category');
            $table->index('priority');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ai_recommendations');
    }
};