<?php

use App\Models\Budget;
use App\Models\Disbursement;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Makes budget utilization traceable.
 *
 * `budgets.used_amount` is a denormalized running total, so until now there
 * was no way to answer "which transactions drove this number?". Expenses were
 * traceable because `expenses.budget_id` is a real foreign key, but payroll
 * disbursements were not: DisbursementService resolved a budget at release
 * time by guessing (department + status + payment date, preferring an
 * Operational budget) and then never recorded the result. The utilization
 * ledger on the budget detail modal needs that link to exist.
 *
 * NOTE: this intentionally backfills with the same heuristic the release path
 * used, so the column agrees with the running total those releases already
 * produced. The heuristic itself is fragile (see DisbursementService); fixing
 * that is separate work and must not silently rewrite historical figures.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            $table->foreignId('budget_id')
                ->nullable()
                ->after('department_id')
                ->constrained()
                ->nullOnDelete();
        });

        $this->backfill();
    }

    /**
     * Only payroll has ever moved a budget's used_amount, so AP-sourced
     * disbursements are left null rather than guessing a budget for them.
     */
    private function backfill(): void
    {
        Disbursement::withTrashed()
            ->where('source_type', 'payroll')
            ->where('status', 'Released')
            ->whereNotNull('department_id')
            ->whereNull('budget_id')
            ->chunkById(200, function ($rows) {
                foreach ($rows as $disbursement) {
                    $budget = $this->resolveBudgetFor($disbursement);
                    if ($budget) {
                        $disbursement->forceFill(['budget_id' => $budget->id])->saveQuietly();
                    }
                }
            });
    }

    /**
     * Mirrors DisbursementService's budget resolution exactly. Kept as a local
     * copy rather than calling the service, because the service path takes a
     * row lock and posts journal entries; a migration must stay a pure
     * read-then-write.
     */
    private function resolveBudgetFor(Disbursement $disbursement): ?Budget
    {
        $paymentDate = $disbursement->payment_date
            ? $disbursement->payment_date->toDateString()
            : now()->toDateString();

        $base = fn () => Budget::where('department_id', $disbursement->department_id)
            ->where('status', Budget::STATUS_ACTIVE)
            ->orderByRaw("CASE WHEN budget_type = 'Operational' THEN 0 ELSE 1 END")
            ->orderBy('id');

        $inPeriod = $base()
            ->where('start_date', '<=', $paymentDate)
            ->where('end_date', '>=', $paymentDate)
            ->first();

        return $inPeriod ?: $base()->first();
    }

    public function down(): void
    {
        Schema::table('disbursements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('budget_id');
        });
    }
};
