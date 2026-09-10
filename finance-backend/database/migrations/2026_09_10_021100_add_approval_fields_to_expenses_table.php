<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add approved_by / approved_at and rejected_by / rejected_at columns to
     * the expenses table so the detail view can show who approved or rejected
     * an expense and when.
     */
    public function up(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            if (! Schema::hasColumn('expenses', 'approved_by')) {
                $table->foreignId('approved_by')
                    ->nullable()
                    ->after('status')
                    ->constrained('users')
                    ->nullOnDelete();
            }

            if (! Schema::hasColumn('expenses', 'approved_at')) {
                $table->timestamp('approved_at')->nullable()->after('approved_by');
            }

            if (! Schema::hasColumn('expenses', 'rejected_by')) {
                $table->foreignId('rejected_by')
                    ->nullable()
                    ->after('approved_at')
                    ->constrained('users')
                    ->nullOnDelete();
            }

            if (! Schema::hasColumn('expenses', 'rejected_at')) {
                $table->timestamp('rejected_at')->nullable()->after('rejected_by');
            }
        });

        // Backfill existing approved and rejected records so they don't show empty audit fields
        DB::table('expenses')
            ->where('status', 'Approved')
            ->whereNull('approved_by')
            ->update([
                'approved_by' => DB::raw('created_by'),
                'approved_at' => DB::raw('updated_at'),
            ]);

        DB::table('expenses')
            ->where('status', 'Rejected')
            ->whereNull('rejected_by')
            ->update([
                'rejected_by' => DB::raw('created_by'),
                'rejected_at' => DB::raw('updated_at'),
            ]);
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            if (Schema::hasColumn('expenses', 'approved_by')) {
                $table->dropConstrainedForeignId('approved_by');
            }
            if (Schema::hasColumn('expenses', 'approved_at')) {
                $table->dropColumn('approved_at');
            }
            if (Schema::hasColumn('expenses', 'rejected_by')) {
                $table->dropConstrainedForeignId('rejected_by');
            }
            if (Schema::hasColumn('expenses', 'rejected_at')) {
                $table->dropColumn('rejected_at');
            }
        });
    }
};
