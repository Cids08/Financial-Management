<?php

namespace Tests\Feature;

use App\Models\AccountsPayable;
use App\Services\DisbursementService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The read path must never write to the ledger.
 *
 * DisbursementService::stats() and paginate() used to call
 * reconcileReleasedDisbursements() before answering. They back
 * GET /api/disbursements/stats and GET /api/disbursements, so every list
 * page load — plus any crawler, prefetch, retry or second tab — pruned
 * journal entries, credited cash and rewrote AP paid_amount. Two concurrent
 * reads could both observe the same duplicate and both credit cash.
 *
 * These tests pin the repair behind an explicit command instead: a read must
 * leave corrupted data exactly as corrupt as it found it, and only
 * ledger:reconcile --apply may touch it.
 */
class LedgerReadPathTest extends TestCase
{
    public function createApplication()
    {
        $app = require __DIR__.'/../../bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();

        // Isolated SQLite only; the legacy migration chain has PostgreSQL SQL.
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');

        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('name');
        });
        Schema::create('titles', function (Blueprint $t) {
            $t->id();
            $t->string('title_name')->nullable();
        });
        Schema::create('departments', function (Blueprint $t) {
            $t->id();
            $t->string('department_name')->nullable();
        });
        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->integer('role_id')->nullable();
            $t->integer('title_id')->nullable();
            $t->integer('department_id')->nullable();
            $t->softDeletes();
            $t->timestamps();
        });
        Schema::create('supporting_documents', function (Blueprint $t) {
            $t->id();
            $t->integer('reference_id')->nullable();
            $t->string('file_name')->nullable();
            $t->timestamps();
        });
        Schema::create('suppliers', function (Blueprint $t) {
            $t->id();
            $t->string('supplier_name')->default('Supplier');
            $t->decimal('current_balance', 15, 2)->default(0);
            $t->softDeletes();
            $t->timestamps();
        });
        Schema::create('accounts_payable', function (Blueprint $t) {
            $t->id();
            $t->integer('supplier_id');
            $t->string('invoice_number');
            $t->date('invoice_date')->nullable();
            $t->decimal('original_amount', 15, 2)->default(0);
            $t->decimal('paid_amount', 15, 2)->default(0);
            $t->decimal('remaining_balance', 15, 2)->default(0);
            $t->string('status')->default('Pending');
            $t->softDeletes();
            $t->timestamps();
        });
        Schema::create('disbursements', function (Blueprint $t) {
            $t->id();
            $t->integer('ap_id')->nullable();
            $t->integer('cash_account_id')->nullable();
            $t->integer('department_id')->nullable();
            $t->integer('approved_by')->nullable();
            $t->integer('released_by')->nullable();
            $t->string('source_type')->default('ap');
            $t->string('voucher_number')->nullable();
            $t->string('payee')->nullable();
            $t->string('reference_number')->nullable();
            $t->string('payroll_batch_number')->nullable();
            $t->integer('created_by')->nullable();
            $t->string('status')->default('Pending');
            $t->date('payment_date')->nullable();
            $t->date('released_date')->nullable();
            $t->decimal('amount_paid', 15, 2)->default(0);
            $t->boolean('has_attachment')->default(false);
            $t->softDeletes();
            $t->timestamps();
        });
        Schema::create('journal_entries', function (Blueprint $t) {
            $t->id();
            $t->string('transaction_no');
            $t->date('transaction_date')->nullable();
            $t->string('status')->default('Posted');
            $t->softDeletes();
            $t->timestamps();
        });
        Schema::create('journal_entry_lines', function (Blueprint $t) {
            $t->id();
            $t->integer('journal_entry_id');
            $t->integer('account_id')->nullable();
            $t->decimal('debit', 15, 2)->default(0);
            $t->decimal('credit', 15, 2)->default(0);
            $t->string('reference_type')->nullable();
            $t->integer('reference_id')->nullable();
            $t->timestamps();
        });
        Schema::create('cash_accounts', function (Blueprint $t) {
            $t->id();
            $t->string('account_code')->nullable();
            $t->string('account_name');
            $t->decimal('opening_balance', 15, 2)->default(0);
            $t->decimal('current_balance', 15, 2)->default(0);
            $t->unsignedInteger('chart_of_account_id')->nullable();
            $t->boolean('is_default')->default(false);
            $t->string('status')->default('Active');
            $t->unsignedInteger('updated_by')->nullable();
            $t->unsignedInteger('deleted_by')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        DB::table('suppliers')->insert(['id' => 1, 'supplier_name' => 'Test Supplier', 'current_balance' => 0]);
    }

    /**
     * Posts the two journal lines a release creates for a disbursement.
     * A second call is how a duplicate posting looks in the table.
     */
    private function postJournalForDisbursement(int $disbursementId, float $amount = 0.0, string $transactionNo = ''): void
    {
        $journalId = DB::table('journal_entries')->insertGetId([
            'transaction_no' => $transactionNo ?: ('DV-TEST-'.$disbursementId),
            'transaction_date' => '2026-10-01',
            'status' => 'Posted',
        ]);

        DB::table('journal_entry_lines')->insert([
            [
                'journal_entry_id' => $journalId, 'account_id' => 1, 'debit' => $amount, 'credit' => 0,
                'reference_type' => 'Disbursement', 'reference_id' => $disbursementId,
            ],
            [
                'journal_entry_id' => $journalId, 'account_id' => 2, 'debit' => 0, 'credit' => $amount,
                'reference_type' => 'Disbursement', 'reference_id' => $disbursementId,
            ],
        ]);
    }

    /**
     * Seeds exactly the state a previous deploy's GET-side reconciler was
     * repairing: a bill already double-counted by repeated reads, plus a
     * duplicate journal posting that pruning would delete.
     */
    private function seedCorruptedLedger(): array
    {
        $billId = DB::table('accounts_payable')->insertGetId([
            'supplier_id' => 1, 'invoice_number' => 'AP-READ', 'original_amount' => 10000,
            'paid_amount' => 8000, 'remaining_balance' => 2000, 'status' => 'Partially Paid',
        ]);

        $disbursementId = DB::table('disbursements')->insertGetId([
            'ap_id' => $billId, 'status' => 'Released', 'amount_paid' => 4000,
            'released_date' => '2026-10-01', 'source_type' => 'ap',
        ]);

        $this->postJournalForDisbursement($disbursementId, 4000, 'DV-ORIG');
        $this->postJournalForDisbursement($disbursementId, 4000, 'DV-DUP');

        return [$billId, $disbursementId];
    }

    /**
     * stats() is the regression: it returned aggregate numbers and used to
     * reconcile on the way. A read must leave the corrupted row alone.
     */
    public function test_stats_does_not_write_to_the_ledger(): void
    {
        [$billId] = $this->seedCorruptedLedger();

        $entriesBefore = DB::table('journal_entries')->count();
        $linesBefore = DB::table('journal_entry_lines')->count();

        $stats = app(DisbursementService::class)->stats();

        $bill = AccountsPayable::find($billId);
        $this->assertSame('8000.00', $bill->paid_amount, 'stats() must not repair paid_amount — it is a read.');
        $this->assertSame('2000.00', $bill->remaining_balance);
        $this->assertSame($entriesBefore, DB::table('journal_entries')->count(), 'stats() must not delete a duplicate journal entry.');
        $this->assertSame($linesBefore, DB::table('journal_entry_lines')->count(), 'stats() must not delete journal lines.');

        // It must still answer the question it was asked.
        $this->assertSame(1, $stats['released']);
        $this->assertSame(4000.0, $stats['total_paid']);
    }

    /**
     * paginate() backs GET /api/disbursements — the list page that used to
     * prune duplicates out from under any other open tab.
     */
    public function test_paginate_does_not_prune_duplicate_journal_entries(): void
    {
        [, $disbursementId] = $this->seedCorruptedLedger();

        $entriesBefore = DB::table('journal_entries')->pluck('id')->all();

        $page = app(DisbursementService::class)->paginate([], 20);

        $this->assertCount(1, $page->items());
        $this->assertEqualsCanonicalizing(
            $entriesBefore,
            DB::table('journal_entries')->pluck('id')->all(),
            'paginate() must return the page without deleting any posting.'
        );
        // Two entries x two lines each — neither posting may be touched.
        $this->assertSame(4, DB::table('journal_entry_lines')
            ->where('reference_type', 'Disbursement')
            ->where('reference_id', $disbursementId)
            ->count());
    }

    /**
     * Running both reads repeatedly must be free of side effects, not merely
     * idempotent — idempotent is what made the write-on-read look harmless.
     */
    public function test_repeated_reads_leave_corruption_untouched(): void
    {
        [$billId] = $this->seedCorruptedLedger();
        $service = app(DisbursementService::class);

        for ($i = 0; $i < 5; $i++) {
            $service->stats();
            $service->paginate([], 20);
        }

        $bill = AccountsPayable::find($billId);
        $this->assertSame('8000.00', $bill->paid_amount, 'Five page loads must not alter money, however consistent the result would be.');
        $this->assertSame(2, DB::table('journal_entries')->count(), 'The duplicate posting must still be there for a repair command to find.');
    }

    /**
     * The command is now the only sanctioned entry point, and it starts in
     * dry-run: nothing is written until --apply is passed explicitly.
     */
    public function test_ledger_reconcile_is_dry_run_unless_apply_is_passed(): void
    {
        [$billId] = $this->seedCorruptedLedger();
        $entriesBefore = DB::table('journal_entries')->count();

        Artisan::call('ledger:reconcile');
        $dryOutput = Artisan::output();

        $this->assertStringContainsString('Dry run', $dryOutput);
        $this->assertSame($entriesBefore, DB::table('journal_entries')->count(), 'Dry run must not prune.');
        $this->assertSame('8000.00', AccountsPayable::find($billId)->paid_amount, 'Dry run must not repair the bill.');

        Artisan::call('ledger:reconcile', ['--apply' => true]);
        // journal_entries soft-deletes (JournalEntry uses SoftDeletes) while
        // journal_entry_lines hard-deletes, so "pruned" means: one live entry
        // left, its duplicate soft-deleted, and its lines gone.
        $this->assertSame(1, DB::table('journal_entries')->whereNull('deleted_at')->count(), 'Apply must prune the duplicate posting.');
        $this->assertSame(2, DB::table('journal_entry_lines')->count(), 'Apply must delete the duplicate posting lines.');
        $this->assertSame('4000.00', AccountsPayable::find($billId)->paid_amount, 'Apply must rebuild paid_amount from the journal.');
        $this->assertSame('6000.00', AccountsPayable::find($billId)->remaining_balance);

        // And the whole thing stays safe to run again.
        Artisan::call('ledger:reconcile', ['--apply' => true]);
        $this->assertSame('4000.00', AccountsPayable::find($billId)->paid_amount, 'A second apply must not double count.');
    }

    /**
     * ledger:integrity is the read-only tool that finds the damage —
     * including lines whose parent entry is gone, which is what an
     * "orphaned posted journal line" looks like here, because
     * journal_entry_lines hard-deletes while journal_entries soft-deletes.
     */
    public function test_ledger_integrity_reports_orphaned_and_dangling_lines_without_writing(): void
    {
        $entryId = DB::table('journal_entries')->insertGetId([
            'transaction_no' => 'JE-ORPHAN', 'transaction_date' => '2026-10-01', 'status' => 'Posted',
        ]);

        // A line whose parent entry is soft-deleted: invisible to normal
        // queries, still counted by anything that sums raw lines.
        DB::table('journal_entry_lines')->insert([
            'journal_entry_id' => $entryId, 'account_id' => 1, 'debit' => 100, 'credit' => 0,
            'reference_type' => 'Disbursement', 'reference_id' => 1,
        ]);
        DB::table('journal_entries')->where('id', $entryId)->update([
            'deleted_at' => date('Y-m-d H:i:s'),
        ]);

        // A line whose parent row does not exist at all.
        DB::table('journal_entry_lines')->insert([
            'journal_entry_id' => 999999, 'account_id' => 2, 'debit' => 0, 'credit' => 100,
            'reference_type' => 'Disbursement', 'reference_id' => 2,
        ]);

        // A live entry whose debits and credits disagree.
        $unbalancedId = DB::table('journal_entries')->insertGetId([
            'transaction_no' => 'JE-UNBAL', 'transaction_date' => '2026-10-02', 'status' => 'Posted',
        ]);
        DB::table('journal_entry_lines')->insert([
            'journal_entry_id' => $unbalancedId, 'account_id' => 1, 'debit' => 500, 'credit' => 0,
        ]);

        $linesBefore = DB::table('journal_entry_lines')->count();

        Artisan::call('ledger:integrity', ['--limit' => 10]);
        $output = Artisan::output();

        $this->assertStringContainsString('orphaned lines', $output);
        $this->assertStringContainsString('dangling lines', $output);
        $this->assertStringContainsString('unbalanced entries', $output);
        $this->assertStringContainsString('missing/soft-deleted master', $output);
        $this->assertStringContainsString('categories need attention', $output);
        $this->assertSame($linesBefore, DB::table('journal_entry_lines')->count(), 'The report must never write.');
    }

    public function test_ledger_integrity_reports_duplicates_but_repairs_nothing(): void
    {
        [$billId] = $this->seedCorruptedLedger();

        Artisan::call('ledger:integrity');
        $output = Artisan::output();

        // The duplicate posting the reconciler exists to prune is surfaced,
        // not silently cleaned up — this tool only ever reads.
        $this->assertStringContainsString('disbursements with duplicate postings', $output);
        $this->assertStringContainsString('ledger:reconcile --apply', $output);
        $this->assertSame(2, DB::table('journal_entries')->count(), 'The report must not prune.');
        $this->assertSame('8000.00', AccountsPayable::find($billId)->paid_amount, 'The report must not repair anything either.');
        $this->assertSame(0, Artisan::call('ledger:integrity'));
    }

    /**
     * The reconciler may not own Overdue (AccountsPayableService derives it
     * from the due date) or Cancelled (a void). Without this guard, running
     * ledger:reconcile --apply flipped overdue bills to 'Partially Paid' and
     * hid them from the overdue dashboard — a damage the dry run caught
     * before it ever ran against production.
     */
    public function test_reconcile_preserves_statuses_it_does_not_own(): void
    {
        $overdueId = DB::table('accounts_payable')->insertGetId([
            'supplier_id' => 1, 'invoice_number' => 'AP-OVERDUE', 'original_amount' => 10000,
            'paid_amount' => 0, 'remaining_balance' => 10000, 'status' => 'Overdue',
        ]);
        $overdueDisb = DB::table('disbursements')->insertGetId([
            'ap_id' => $overdueId, 'status' => 'Released', 'amount_paid' => 4000,
            'released_date' => '2026-10-01', 'source_type' => 'ap',
        ]);
        $this->postJournalForDisbursement($overdueDisb, 4000, 'DV-OVERDUE');

        $cancelledId = DB::table('accounts_payable')->insertGetId([
            'supplier_id' => 1, 'invoice_number' => 'AP-CANCELLED', 'original_amount' => 10000,
            'paid_amount' => 0, 'remaining_balance' => 10000, 'status' => 'Cancelled',
        ]);
        $cancelledDisb = DB::table('disbursements')->insertGetId([
            'ap_id' => $cancelledId, 'status' => 'Released', 'amount_paid' => 4000,
            'released_date' => '2026-10-01', 'source_type' => 'ap',
        ]);
        $this->postJournalForDisbursement($cancelledDisb, 4000, 'DV-CANCELLED');

        Artisan::call('ledger:reconcile', ['--apply' => true]);

        $overdue = AccountsPayable::find($overdueId);
        $this->assertSame('4000.00', $overdue->paid_amount, 'The journal-derived paid amount is still repaired.');
        $this->assertSame('6000.00', $overdue->remaining_balance);
        $this->assertSame('Overdue', $overdue->status, 'Repairing money must not erase a due-date status.');

        $cancelled = AccountsPayable::find($cancelledId);
        $this->assertSame('Cancelled', $cancelled->status, 'Repairing money must not un-void a cancelled bill.');
    }

    /**
     * A dry run is only worth having if it predicts --apply exactly. Run the
     * preview, apply, then preview again: the second preview must find
     * nothing, proving the first one listed every write that was going to
     * happen and no write it was not.
     */
    public function test_dry_run_predicts_exactly_what_apply_does(): void
    {
        $this->seedCorruptedLedger();

        Artisan::call('ledger:reconcile');
        $preview = Artisan::output();

        $this->assertStringContainsString('pending repair', $preview, 'The dry run must predict work.');

        Artisan::call('ledger:reconcile', ['--apply' => true]);

        Artisan::call('ledger:reconcile');
        $after = Artisan::output();

        $this->assertStringContainsString(
            'Dry run found nothing to repair',
            $after,
            'After --apply the preview must be empty — the first preview predicted the whole write set.'
        );
    }
}
