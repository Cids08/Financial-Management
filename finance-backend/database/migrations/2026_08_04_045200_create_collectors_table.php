<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('collectors')) {
            Schema::create('collectors', function (Blueprint $table) {
                $table->id();
                $table->string('employee_no')->unique();
                $table->string('first_name');
                $table->string('middle_name')->nullable();
                $table->string('last_name');
                $table->string('phone_number', 20)->nullable();
                $table->string('email')->nullable();
                $table->string('profile_photo')->nullable();
                $table->string('assigned_area')->nullable();
                $table->decimal('commission_rate', 5, 2)->default(0);
                $table->decimal('monthly_target', 15, 2)->default(0);
                $table->string('status')->default('Active'); // 'Active' | 'Inactive'
                $table->timestamps();
                $table->softDeletes(); // deleted_at drives is_archived

                // No created_by — matches the ERD (same pattern as `users`).
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
            });

            return;
        }

        // Table already exists — add only whatever columns are missing.
        Schema::table('collectors', function (Blueprint $table) {
            if (! Schema::hasColumn('collectors', 'employee_no')) {
                $table->string('employee_no')->unique()->nullable();
            }
            if (! Schema::hasColumn('collectors', 'first_name')) {
                $table->string('first_name')->nullable();
            }
            if (! Schema::hasColumn('collectors', 'middle_name')) {
                $table->string('middle_name')->nullable();
            }
            if (! Schema::hasColumn('collectors', 'last_name')) {
                $table->string('last_name')->nullable();
            }
            if (! Schema::hasColumn('collectors', 'phone_number')) {
                $table->string('phone_number', 20)->nullable();
            }
            if (! Schema::hasColumn('collectors', 'email')) {
                $table->string('email')->nullable();
            }
            if (! Schema::hasColumn('collectors', 'profile_photo')) {
                $table->string('profile_photo')->nullable();
            }
            if (! Schema::hasColumn('collectors', 'assigned_area')) {
                $table->string('assigned_area')->nullable();
            }
            if (! Schema::hasColumn('collectors', 'commission_rate')) {
                $table->decimal('commission_rate', 5, 2)->default(0);
            }
            if (! Schema::hasColumn('collectors', 'monthly_target')) {
                $table->decimal('monthly_target', 15, 2)->default(0);
            }
            if (! Schema::hasColumn('collectors', 'status')) {
                $table->string('status')->default('Active');
            }
            if (! Schema::hasColumn('collectors', 'updated_by')) {
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('collectors', 'deleted_by')) {
                $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('collectors', 'deleted_at')) {
                $table->softDeletes();
            }
        });
    }

    public function down(): void
    {
        // Intentionally left blank — an additive/create-or-sync migration
        // can't safely tell which columns it added vs. which already
        // existed, so rolling back would risk dropping the wrong ones.
    }
};