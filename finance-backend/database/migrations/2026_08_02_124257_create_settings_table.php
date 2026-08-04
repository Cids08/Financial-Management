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
        Schema::create('settings', function (Blueprint $table) {

            /*
            |--------------------------------------------------------------------------
            | Primary Key
            |--------------------------------------------------------------------------
            */

            $table->id();

            /*
            |--------------------------------------------------------------------------
            | Company Information
            |--------------------------------------------------------------------------
            */

            $table->string('company_name');

            $table->text('company_address')->nullable();

            $table->string('company_email')->nullable();

            $table->string('company_phone')->nullable();

            $table->string('company_logo')->nullable();

            /*
            |--------------------------------------------------------------------------
            | Financial Settings
            |--------------------------------------------------------------------------
            */

            $table->string('currency', 3)->default('PHP');

            $table->year('fiscal_year');

            $table->decimal('default_tax_rate', 5, 2)->default(12.00);

            /*
            |--------------------------------------------------------------------------
            | Forecast Settings
            |--------------------------------------------------------------------------
            */

            $table->unsignedTinyInteger('forecast_months')->default(12);

            /*
            |--------------------------------------------------------------------------
            | Timestamps
            |--------------------------------------------------------------------------
            */

            $table->timestamps();

        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};