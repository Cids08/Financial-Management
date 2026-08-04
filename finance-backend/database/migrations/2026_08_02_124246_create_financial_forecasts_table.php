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
        Schema::create('financial_forecasts', function (Blueprint $table) {

            /*
            |--------------------------------------------------------------------------
            | Primary Key
            |--------------------------------------------------------------------------
            */

            $table->id();

            /*
            |--------------------------------------------------------------------------
            | Forecast Information
            |--------------------------------------------------------------------------
            */

            $table->string('forecast_no')->unique();

            $table->string('forecast_name');

            $table->enum('forecast_type', [
                'Monthly',
                'Quarterly',
                'Yearly'
            ]);

            $table->enum('forecast_target', [
                'Revenue',
                'Expense',
                'Cash Flow',
                'Budget'
            ]);

            /*
            |--------------------------------------------------------------------------
            | Forecast Period
            |--------------------------------------------------------------------------
            */

            $table->date('historical_start');

            $table->date('historical_end');

            $table->date('forecast_start');

            $table->date('forecast_end');

            $table->unsignedInteger('forecast_period');

            /*
            |--------------------------------------------------------------------------
            | Forecast Results
            |--------------------------------------------------------------------------
            */

            $table->decimal('actual_amount', 15, 2)->nullable();

            $table->decimal('predicted_amount', 15, 2);

            $table->decimal('confidence_level', 5, 2);

            $table->decimal('mape', 8, 4)->nullable();

            $table->decimal('rmse', 15, 4)->nullable();

            /*
            |--------------------------------------------------------------------------
            | AI Model
            |--------------------------------------------------------------------------
            */

            $table->string('algorithm')->default('ARIMA');

            $table->string('model_version')->default('1.0');

            /*
            |--------------------------------------------------------------------------
            | Status
            |--------------------------------------------------------------------------
            */

            $table->enum('status', [
                'Generated',
                'Reviewed',
                'Archived'
            ])->default('Generated');

            /*
            |--------------------------------------------------------------------------
            | Audit
            |--------------------------------------------------------------------------
            */

            $table->foreignId('generated_by')
                ->constrained('users')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreignId('updated_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('generated_at');

            $table->text('remarks')->nullable();

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

            $table->index('forecast_type');
            $table->index('forecast_target');
            $table->index('algorithm');
            $table->index('status');
            $table->index('forecast_start');
            $table->index('forecast_end');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('financial_forecasts');
    }
};