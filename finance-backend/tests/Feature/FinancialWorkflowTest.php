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

class FinancialWorkflowTest extends TestCase
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

        Schema::create('suppliers', fn (Blueprint $t) => $t->id());
        DB::table('suppliers')->insert([['id'=>1],['id'=>2]]);
        Schema::create('cash_accounts', function(Blueprint $t) { $t->id(); $t->string('account_code'); $t->string('account_name'); });
        DB::table('cash_accounts')->insert(['id'=>1,'account_code'=>'CA1','account_name'=>'Bank']);
        Schema::create('collections', function(Blueprint $t) { $t->id(); $t->integer('cash_account_id'); $t->string('status'); $t->date('collection_date'); $t->decimal('amount_received',15,2); $t->softDeletes(); });
        Schema::table('disbursements', function(Blueprint $t) { $t->integer('cash_account_id'); $t->string('status'); $t->date('payment_date'); $t->date('released_date')->nullable(); $t->decimal('amount_paid',15,2); $t->decimal('net_amount',15,2)->nullable(); $t->decimal('ewt_amount',15,2)->default(0); $t->softDeletes(); });
        Schema::table('expenses', function(Blueprint $t) { $t->integer('supplier_id')->nullable(); $t->string('receipt_number')->nullable(); $t->integer('cash_account_id')->nullable(); $t->string('status')->default('Pending'); $t->date('expense_date')->nullable(); $t->decimal('expense_amount',15,2)->default(0); $t->softDeletes(); });
        Schema::create('accounts_payable', function(Blueprint $t) { $t->id(); $t->integer('supplier_id'); $t->integer('account_id')->nullable(); $t->string('invoice_number'); $t->date('invoice_date'); $t->decimal('original_amount',15,2); $t->string('status'); $t->softDeletes(); $t->timestamps(); });
        (require __DIR__.'/../../database/migrations/2026_10_03_180000_add_budget_to_accounts_payable.php')->up();
        Schema::table('journal_entries', function(Blueprint $t) { $t->integer('posted_by')->nullable(); $t->dateTime('posted_at')->nullable(); $t->integer('created_by')->nullable(); $t->timestamps(); });
        Schema::table('journal_entry_lines', function(Blueprint $t) { $t->string('remarks')->nullable(); $t->timestamps(); });
        DB::table('chart_of_accounts')->where('id',2)->update(['account_code'=>'2000','account_name'=>'Accounts Payable']);
        DB::table('budget_account_allocations')->insert(['budget_id'=>1,'account_id'=>1,'allocated_amount'=>1000]);
    }

    private function expense(array $extra=[]): int { return DB::table('expenses')->insertGetId(array_merge(['supplier_id'=>1,'receipt_number'=>'INV-1','cash_account_id'=>1,'status'=>'Approved','expense_date'=>'2026-10-01','expense_amount'=>20],$extra)); }
    private function bill(array $extra=[]): int { return DB::table('accounts_payable')->insertGetId(array_merge(['supplier_id'=>1,'account_id'=>1,'budget_id'=>1,'invoice_number'=>'INV-1','invoice_date'=>'2026-10-01','original_amount'=>100,'status'=>'Pending'],$extra)); }
    public function test_cash_flow_counts_settled_archived_records_net_withholding_and_direct_expenses(): void
    {
        foreach(['Confirmed','Pending','Cancelled'] as $status) DB::table('collections')->insert(['cash_account_id'=>1,'status'=>$status,'collection_date'=>'2026-10-01','amount_received'=>100,'deleted_at'=>now()]);
        foreach(['Released','Pending','Approved','Rejected'] as $status) DB::table('disbursements')->insert(['cash_account_id'=>1,'status'=>$status,'payment_date'=>'2026-09-01','released_date'=>'2026-10-01','amount_paid'=>100,'ewt_amount'=>2,'net_amount'=>98,'deleted_at'=>now()]);
        DB::table('disbursements')->insert(['cash_account_id'=>1,'status'=>'Released','payment_date'=>'2026-10-02','amount_paid'=>50,'ewt_amount'=>1]);
        DB::table('disbursements')->insert(['cash_account_id'=>1,'status'=>'Released','payment_date'=>'2026-10-02','released_date'=>'2026-11-01','amount_paid'=>500,'net_amount'=>500]);
        $this->expense(['deleted_at'=>now()]); $this->expense(['status'=>'Pending']); $this->expense(['status'=>'Rejected']); $this->expense(['expense_date'=>'2026-09-01']);
        $rows=app(\App\Services\ReportService::class)->cashFlow(\Carbon\Carbon::parse('2026-10-01'),\Carbon\Carbon::parse('2026-10-31'));
        $this->assertCount(1,$rows); $this->assertEquals(100,$rows[0]['inflow']); $this->assertEquals(167,$rows[0]['outflow']);
    }
    public function test_ap_blocks_duplicate_expense_even_when_archived(): void
    {
        $this->bill(['deleted_at'=>now()]); $this->expectException(ValidationException::class);
        DB::transaction(fn()=>app(\App\Services\SupplierDocumentGuard::class)->check(1,' inv-1 ','expense'));
    }
    public function test_expense_blocks_ap_but_not_self_edits_or_other_suppliers(): void
    {
        $id=$this->expense(); $guard=app(\App\Services\SupplierDocumentGuard::class);
        DB::transaction(function() use($id,$guard) { $guard->check(1,'INV-1','expense',$id); $guard->check(2,'INV-1','ap'); });
        $this->expectException(ValidationException::class); DB::transaction(fn()=>$guard->check(1,'INV-1','ap'));
    }
    public function test_rejected_and_cancelled_allow_reentry_but_missing_reference_does_not(): void
    {
        $this->expense(['status'=>'Rejected']); $this->bill(['status'=>'Cancelled']);
        DB::transaction(fn()=>app(\App\Services\SupplierDocumentGuard::class)->check(1,'INV-1','expense'));
        $this->expectException(ValidationException::class); DB::transaction(fn()=>app(\App\Services\SupplierDocumentGuard::class)->check(1,'','expense'));
    }
    public function test_ap_requires_explicit_active_account_and_valid_budget_mapping_and_date(): void
    {
        $guard=app(\App\Services\ApPostingGuard::class); $this->assertEquals(1,$guard->validate(1,1,'2026-10-01')->id);
        foreach([[null,null,'2026-10-01'],[2,null,'2026-10-01'],[3,1,'2026-10-01'],[1,1,'2027-01-01'],[5,null,'2026-10-01']] as $args) {
            try { $guard->validate(...$args); $this->fail('Invalid posting accepted'); } catch(ValidationException $e) { $this->assertNotEmpty($e->errors()); }
        }
    }
    public function test_ap_journal_carries_budget_and_payment_does_not_double_count_expense(): void
    {
        $bill=\App\Models\AccountsPayable::find($this->bill()); $bill->setRelation('supplier',null); $user=new \App\Models\User; $user->id=1;
        $method=new \ReflectionMethod(\App\Services\AccountsPayableService::class,'postApprovalJournalEntry');
        $method->invoke(app(\App\Services\AccountsPayableService::class),$user,$bill);
        $this->assertTrue(DB::table('journal_entries')->whereDate('transaction_date','2026-10-01')->where('status','Posted')->exists());
        $this->assertDatabaseHas('journal_entry_lines',['account_id'=>1,'debit'=>100,'budget_id'=>1,'department_id'=>1]);
        $this->assertDatabaseHas('journal_entry_lines',['account_id'=>2,'credit'=>100]);
        $entry=DB::table('journal_entries')->insertGetId(['transaction_no'=>'PAY','transaction_date'=>'2026-10-02','description'=>'Settlement','status'=>'Posted']);
        DB::table('journal_entry_lines')->insert([['journal_entry_id'=>$entry,'account_id'=>2,'debit'=>100,'credit'=>0],['journal_entry_id'=>$entry,'account_id'=>3,'debit'=>0,'credit'=>100]]);
        $report=app(\App\Services\ReportService::class)->incomeStatement(\Carbon\Carbon::parse('2026-10-01'),\Carbon\Carbon::parse('2026-10-31'));
        $this->assertEquals(100,collect($report['expenses'])->sum('amount'));
        $this->assertEquals(200,app(BudgetGlService::class)->summary(Budget::find(1))['actual']);
    }
}
