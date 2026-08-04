<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cash_accounts')) {
            Schema::create('cash_accounts', function (Blueprint $table) {
                $table->id();
                $table->string('account_code')->unique();
                $table->string('account_name');
                $table->string('bank_name')->nullable();
                $table->string('branch_name')->nullable();
                $table->string('account_number')->unique();
                $table->string('swift_code')->nullable();
                $table->string('account_type'); // Checking | Savings | Petty Cash | Money Market
                $table->string('currency', 3)->default('PHP');
                $table->decimal('opening_balance', 15, 2)->default(0);
                $table->decimal('current_balance', 15, 2)->default(0);
                $table->boolean('is_default')->default(false);
                $table->string('status')->default('Active'); // 'Active' | 'Inactive'
                $table->timestamps();
                $table->softDeletes(); // deleted_at drives is_archived

                // No created_by — matches the ERD.
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
            });

            return;
        }

        // Table already exists — add only whatever columns are missing.
        Schema::table('cash_accounts', function (Blueprint $table) {
            if (! Schema::hasColumn('cash_accounts', 'account_code')) {
                $table->string('account_code')->unique()->nullable();
            }
            if (! Schema::hasColumn('cash_accounts', 'account_name')) {
                $table->string('account_name')->nullable();
            }
            if (! Schema::hasColumn('cash_accounts', 'bank_name')) {
                $table->string('bank_name')->nullable();
            }
            if (! Schema::hasColumn('cash_accounts', 'branch_name')) {
                $table->string('branch_name')->nullable();
            }
            if (! Schema::hasColumn('cash_accounts', 'account_number')) {
                $table->string('account_number')->unique()->nullable();
            }
            if (! Schema::hasColumn('cash_accounts', 'swift_code')) {
                $table->string('swift_code')->nullable();
            }
            if (! Schema::hasColumn('cash_accounts', 'account_type')) {
                $table->string('account_type')->nullable();
            }
            if (! Schema::hasColumn('cash_accounts', 'currency')) {
                $table->string('currency', 3)->default('PHP');
            }
            if (! Schema::hasColumn('cash_accounts', 'opening_balance')) {
                $table->decimal('opening_balance', 15, 2)->default(0);
            }
            if (! Schema::hasColumn('cash_accounts', 'current_balance')) {
                $table->decimal('current_balance', 15, 2)->default(0);
            }
            if (! Schema::hasColumn('cash_accounts', 'is_default')) {
                $table->boolean('is_default')->default(false);
            }
            if (! Schema::hasColumn('cash_accounts', 'status')) {
                $table->string('status')->default('Active');
            }
            if (! Schema::hasColumn('cash_accounts', 'updated_by')) {
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('cash_accounts', 'deleted_by')) {
                $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('cash_accounts', 'deleted_at')) {
                $table->softDeletes();
            }
        });
    }

    public function down(): void
    {
        // Intentionally left blank — see collectors migration for why.
    }
};