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
        Schema::create('fixed_assets', function (Blueprint $table) {

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

            $table->foreignId('department_id')
                ->nullable()
                ->constrained()
                ->nullOnDelete();

            /*
            |--------------------------------------------------------------------------
            | Asset Information
            |--------------------------------------------------------------------------
            */

            $table->string('asset_code')->unique();

            $table->string('asset_name');

            $table->enum('asset_category', [
                'Land',
                'Building',
                'Vehicle',
                'Machinery',
                'Equipment',
                'Furniture',
                'Computer',
                'Office Equipment',
                'Other'
            ]);

            $table->string('serial_number')->nullable();

            $table->string('brand')->nullable();

            $table->string('model')->nullable();

            $table->string('location')->nullable();

            /*
            |--------------------------------------------------------------------------
            | Purchase Information
            |--------------------------------------------------------------------------
            */

            $table->date('purchase_date');

            $table->decimal('purchase_cost', 15, 2);

            $table->decimal('salvage_value', 15, 2)->default(0);

            $table->integer('useful_life_years');

            /*
            |--------------------------------------------------------------------------
            | Depreciation
            |--------------------------------------------------------------------------
            */

            $table->enum('depreciation_method', [
                'Straight Line',
                'Declining Balance'
            ])->default('Straight Line');

            $table->decimal('annual_depreciation', 15, 2)->default(0);

            $table->decimal('accumulated_depreciation', 15, 2)->default(0);

            $table->decimal('book_value', 15, 2);

            /*
            |--------------------------------------------------------------------------
            | Status
            |--------------------------------------------------------------------------
            */

            $table->enum('status', [
                'Active',
                'Disposed',
                'Sold',
                'Maintenance'
            ])->default('Active');

            /*
            |--------------------------------------------------------------------------
            | Remarks
            |--------------------------------------------------------------------------
            */

            $table->text('remarks')->nullable();

            /*
            |--------------------------------------------------------------------------
            | Audit
            |--------------------------------------------------------------------------
            */

            $table->foreignId('created_by')
                ->constrained('users')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreignId('updated_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

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

            $table->index('department_id');
            $table->index('asset_category');
            $table->index('status');
            $table->index('purchase_date');

        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fixed_assets');
    }
};