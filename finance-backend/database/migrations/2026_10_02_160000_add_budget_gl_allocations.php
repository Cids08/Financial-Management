<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('budget_account_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('budget_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('chart_of_accounts')->restrictOnDelete();
            $table->decimal('allocated_amount', 15, 2);
            $table->timestamps();
            $table->unique(['budget_id', 'account_id']);
        });
        Schema::table('journal_entry_lines', function (Blueprint $table) {
            $table->foreignId('budget_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->restrictOnDelete();
            $table->index(['budget_id', 'department_id', 'account_id'], 'journal_budget_dimension_idx');
        });
        // Only recover dimensions from explicit source budget links. Never guess
        // by department/year or change historical account/debit/credit amounts.
        foreach (['expenses' => ['expense', 'expenses'], 'disbursements' => ['disbursement', 'disbursements']] as $table => $types) {
            DB::table('journal_entry_lines as l')
                ->join($table.' as s', 's.id', '=', 'l.reference_id')
                ->join('budgets as b', 'b.id', '=', 's.budget_id')
                ->whereIn(DB::raw('LOWER(l.reference_type)'), $types)
                ->select('l.id', 'b.id as budget_id', 'b.department_id')
                ->chunkById(500, function ($rows) {
                    foreach ($rows as $row) {
                        DB::table('journal_entry_lines')->where('id', $row->id)->update([
                            'budget_id' => $row->budget_id, 'department_id' => $row->department_id,
                        ]);
                    }
                }, 'l.id', 'id');
        }
    }

    public function down(): void
    {
        Schema::table('journal_entry_lines', function (Blueprint $table) {
            $table->dropIndex('journal_budget_dimension_idx');
            $table->dropConstrainedForeignId('budget_id');
            $table->dropConstrainedForeignId('department_id');
        });
        Schema::dropIfExists('budget_account_allocations');
    }
};
