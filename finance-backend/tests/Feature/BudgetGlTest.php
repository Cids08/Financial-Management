<?php

namespace Tests\Feature;

use App\Models\Budget;
use App\Services\BudgetGlService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class BudgetGlTest extends TestCase
{
    public function createApplication()
    {
        $app = require __DIR__.'/../../bootstrap/app.php';
        $app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();
        // Isolated SQLite only; the legacy migration chain has PostgreSQL SQL.
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');
        Schema::create('users', fn (Blueprint $t) => $t->id());
        Schema::create('departments', function (Blueprint $t) { $t->id(); $t->string('department_name')->default('Operations'); $t->softDeletes(); });
        Schema::create('chart_of_accounts', function (Blueprint $t) {
            $t->id(); $t->string('account_code'); $t->string('account_name');
            $t->string('account_type'); $t->string('account_category')->nullable();
            $t->boolean('is_active')->default(true); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('budgets', function (Blueprint $t) {
            $t->id(); $t->integer('fiscal_year')->default(2026); $t->integer('department_id'); $t->string('budget_code'); $t->string('status');
            $t->decimal('allocated_amount', 15, 2); $t->decimal('used_amount', 15, 2)->default(0);
            $t->date('start_date'); $t->date('end_date'); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('journal_entries', function (Blueprint $t) {
            $t->id(); $t->string('transaction_no'); $t->date('transaction_date');
            $t->string('description')->default('Test'); $t->string('status'); $t->softDeletes();
        });
        Schema::create('journal_entry_lines', function (Blueprint $t) {
            $t->id(); $t->integer('journal_entry_id'); $t->integer('account_id');
            $t->decimal('debit', 15, 2)->default(0); $t->decimal('credit', 15, 2)->default(0);
            $t->string('reference_type')->nullable(); $t->integer('reference_id')->nullable();
        });
        foreach (['expenses', 'disbursements'] as $table) Schema::create($table, function (Blueprint $t) { $t->id(); $t->integer('budget_id')->nullable(); });
        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id(); $t->integer('user_id'); $t->string('module'); $t->string('action'); $t->integer('record_id');
            $t->string('activity_description'); $t->text('old_values'); $t->text('new_values'); $t->timestamps();
        });
        DB::table('users')->insert(['id' => 1]);
        DB::table('departments')->insert([['id' => 1], ['id' => 2]]);
        DB::table('budgets')->insert(['id' => 1, 'department_id' => 1, 'budget_code' => 'B-1', 'status' => 'Active', 'allocated_amount' => 1000, 'used_amount' => 500, 'start_date' => '2026-01-01', 'end_date' => '2026-12-31']);
        foreach (['Expense', 'Liability', 'Asset', 'Asset', 'Expense'] as $i => $type) {
            DB::table('chart_of_accounts')->insert(['id' => $i + 1, 'account_code' => (string) (5000 + $i), 'account_name' => 'Account '.$i, 'account_type' => $type, 'account_category' => $i === 3 ? 'Fixed Asset' : 'Current Asset', 'is_active' => $i !== 4]);
        }
        // A historical expense with an explicit budget; unknown source stays unassigned.
        DB::table('expenses')->insert(['id' => 10, 'budget_id' => 1]);
        DB::table('journal_entries')->insert(['id' => 1, 'transaction_no' => 'HIST', 'transaction_date' => '2026-01-01', 'status' => 'Posted']);
        DB::table('journal_entry_lines')->insert(['id' => 1, 'journal_entry_id' => 1, 'account_id' => 1, 'debit' => 100, 'reference_type' => 'Expenses', 'reference_id' => 10]);
        (require __DIR__.'/../../database/migrations/2026_10_02_160000_add_budget_gl_allocations.php')->up();
    }

    private function line(int $account, int $debit, int $credit = 0, string $date = '2026-06-01', string $status = 'Posted', ?int $budget = 1, int $dept = 1, bool $deleted = false): int
    {
        $id = DB::table('journal_entries')->insertGetId(['transaction_no' => uniqid('JE'), 'transaction_date' => $date, 'status' => $status, 'deleted_at' => $deleted ? now() : null]);
        DB::table('journal_entry_lines')->insert(['journal_entry_id' => $id, 'account_id' => $account, 'debit' => $debit, 'credit' => $credit, 'budget_id' => $budget, 'department_id' => $dept]);
        return $id;
    }

    public function test_posted_actuals_include_reversals_and_exclude_settlements_wrong_dimensions_and_unposted_entries(): void
    {
        $service = app(BudgetGlService::class);
        $budget = Budget::findOrFail(1);
        $service->save($budget, [['account_id' => 1, 'allocated_amount' => 800], ['account_id' => 4, 'allocated_amount' => 200]], 1, true);
        $this->line(1, 300);
        $this->line(1, 0, 50); // reversal
        $this->line(4, 80, 0, '2026-12-31'); // included last day
        $this->line(2, 300); // payroll/AP settlement
        $this->line(3, 0, 300); // cash settlement
        $this->line(1, 999, 0, '2025-12-31');
        $this->line(1, 999, 0, '2027-01-01');
        $this->line(1, 999, 0, status: 'Draft');
        $this->line(1, 999, 0, dept: 2);
        $this->line(1, 999, 0, budget: null);
        $this->line(1, 999, 0, deleted: true);
        $summary = $service->summary($budget->fresh());
        self::assertSame(430.0, $summary['actual']); // historical 100 + 300 - 50 + asset 80
        self::assertSame(570.0, $summary['difference']);
        self::assertSame(70.0, $summary['operational_gl_difference']);
        self::assertTrue($summary['allocation_complete']);
        self::assertSame(0.0, $summary['unallocated']);
        self::assertCount(2, $summary['accounts']);
        $ledger = $service->ledger($budget, null);
        self::assertCount(4, $ledger['rows']);
        self::assertSame($summary['actual'], $ledger['total']);
        self::assertSame(350.0, $service->ledger($budget, 1)['total']);
        self::assertSame(1, DB::table('journal_entry_lines')->where('id', 1)->value('budget_id'));
        self::assertSame(1, DB::table('journal_entry_lines')->where('id', 1)->value('department_id'));
        self::assertSame(1, DB::table('audit_logs')->count());
        $report = app(\App\Services\ReportService::class)->budgetVsActual(2026);
        self::assertSame(430.0, $report[0]['actual']);
        self::assertSame(1000.0, $report[0]['allocated']);
    }

    public function test_legacy_unallocated_and_unplanned_postings_are_explicit(): void
    {
        $report = app(BudgetGlService::class)->summary(Budget::findOrFail(1));
        self::assertFalse($report['allocation_complete']);
        self::assertSame(1000.0, $report['unallocated']);
        self::assertSame(100.0, $report['actual']);
        self::assertSame(0.0, $report['accounts'][0]['allocated_amount']);
    }

    public function test_invalid_allocations_do_not_replace_existing_plan(): void
    {
        $service = app(BudgetGlService::class);
        $budget = Budget::findOrFail(1);
        $service->save($budget, [['account_id' => 1, 'allocated_amount' => 1000]], 1, true);
        foreach ([[], [['account_id' => 1, 'allocated_amount' => 999]], [['account_id' => 2, 'allocated_amount' => 1000]], [['account_id' => 3, 'allocated_amount' => 1000]], [['account_id' => 5, 'allocated_amount' => 1000]], [['account_id' => 1, 'allocated_amount' => 500], ['account_id' => 1, 'allocated_amount' => 500]], [['account_id' => 1, 'allocated_amount' => '1000.001']]] as $rows) {
            try {
                $service->save($budget, $rows, 1, true);
                self::fail('Expected validation failure');
            } catch (ValidationException $e) {
                self::assertNotEmpty($e->errors());
            }
            self::assertEquals(1000, DB::table('budget_account_allocations')->sum('allocated_amount'));
        }
    }

    public function test_active_allocations_require_approval_permission_and_closed_budgets_stay_locked(): void
    {
        $service = app(BudgetGlService::class);
        $budget = Budget::findOrFail(1);
        try {
            $service->save($budget, [['account_id' => 1, 'allocated_amount' => 1000]], 1, false);
            self::fail('Expected forbidden');
        } catch (HttpException $e) { self::assertSame(403, $e->getStatusCode()); }
        $budget->update(['status' => 'Closed']);
        $this->expectException(ValidationException::class);
        $service->save($budget, [['account_id' => 1, 'allocated_amount' => 1000]], 1, true);
    }

    public function test_expense_account_options_follow_allocations_and_reject_inactive_or_removed_accounts(): void
    {
        $budget = Budget::findOrFail(1);
        $accounts = app(\App\Services\ExpenseGlAccountService::class);
        self::assertSame([1, 4], $accounts->options($budget)->pluck('id')->all());
        app(BudgetGlService::class)->save($budget, [['account_id' => 4, 'allocated_amount' => 1000]], 1, true);
        self::assertSame([4], $accounts->options($budget)->pluck('id')->all());
        self::assertSame(4, $accounts->selected($budget, 4)->id);
        foreach ([null, 1, 2, 3, 5] as $id) {
            try {
                $accounts->selected($budget, $id);
                self::fail('Expected invalid account selection');
            } catch (ValidationException $e) {
                self::assertArrayHasKey('gl_account_id', $e->errors());
            }
        }
        DB::table('chart_of_accounts')->where('id', 4)->update(['is_active' => false]);
        $this->expectException(ValidationException::class);
        $accounts->selected($budget, 4);
    }

    public function test_expense_posting_uses_the_explicit_account_and_preserves_budget_dimensions(): void
    {
        (require __DIR__.'/../../database/migrations/2026_10_02_170000_add_gl_account_to_expenses.php')->up();
        Schema::table('expenses', function (Blueprint $t) {
            $t->decimal('expense_amount', 15, 2)->default(0); $t->date('expense_date')->nullable();
            $t->text('description')->nullable(); $t->timestamps(); $t->softDeletes();
        });
        Schema::table('journal_entries', function (Blueprint $t) {
            $t->integer('posted_by')->nullable(); $t->integer('created_by')->nullable();
            $t->timestamp('posted_at')->nullable(); $t->timestamps();
        });
        Schema::table('journal_entry_lines', function (Blueprint $t) { $t->text('remarks')->nullable(); $t->timestamps(); });
        DB::table('chart_of_accounts')->where('id', 3)->update(['account_code' => '1000']);
        $budget = Budget::findOrFail(1);
        app(BudgetGlService::class)->save($budget, [['account_id' => 1, 'allocated_amount' => 800], ['account_id' => 4, 'allocated_amount' => 200]], 1, true);
        DB::table('expenses')->where('id', 10)->update(['gl_account_id' => 4, 'expense_amount' => 50, 'expense_date' => '2026-05-01', 'description' => 'Capital purchase']);
        $expense = \App\Models\Expense::findOrFail(10);
        $post = new \ReflectionMethod(\App\Services\ExpenseService::class, 'postJournalEntry');
        $post->invoke(app(\App\Services\ExpenseService::class), $expense, (new \App\Models\User)->forceFill(['id' => 1]));
        $entry = DB::table('journal_entries')->where('id', '>', 1)->first();
        $lines = DB::table('journal_entry_lines')->where('journal_entry_id', $entry->id)->get();
        self::assertCount(2, $lines);
        self::assertSame(4, $lines->firstWhere('credit', 0)->account_id);
        self::assertSame(3, $lines->firstWhere('debit', 0)->account_id);
        foreach ($lines as $line) {
            self::assertSame(1, $line->budget_id);
            self::assertSame(1, $line->department_id);
        }
        self::assertEquals($lines->sum('debit'), $lines->sum('credit'));
        self::assertSame(150.0, app(BudgetGlService::class)->summary($budget->fresh())['actual']);
        self::assertSame(4, $expense->fresh()->gl_account_id);
        // Once its allocation is removed, the same pending selection cannot post.
        app(BudgetGlService::class)->save($budget, [['account_id' => 1, 'allocated_amount' => 1000]], 1, true);
        try {
            $post->invoke(app(\App\Services\ExpenseService::class), $expense, (new \App\Models\User)->forceFill(['id' => 1]));
            self::fail('Expected stale selection rejection');
        } catch (ValidationException $e) { self::assertArrayHasKey('gl_account_id', $e->errors()); }
        self::assertSame(2, DB::table('journal_entries')->count());
    }
}
