<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\PermanentDeleteController;
use App\Models\AccountsPayable;
use App\Models\Disbursement;
use App\Models\TaxObligation;
use App\Services\DisbursementService;
use App\Services\Forecasting\HistoricalActuals;
use App\Services\Forecasting\SimpleForecastEngine;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Regression tests for the money-integrity fixes.
 *
 * Each test here corresponds to a defect that silently corrupted financial
 * figures rather than throwing an error:
 *
 *  1. DisbursementService::reconcileReleasedDisbursements() re-adding a
 *     released disbursement's amount_paid on every GET /disbursements, because
 *     a partial release left the bill on 'Pending'.
 *  2. DisbursementService::release() trusting the caller's (unlocked) model for
 *     the status guard instead of re-reading a locked row inside the
 *     transaction — two concurrent releases both paid the same voucher.
 *  3. TaxObligationService::recordAsExpense() posting a journal entry with no
 *     cash side when cash_account_id was null, booking a BIR remittance that
 *     never left the bank.
 *  4. PermanentDeleteController force-deleting a record while posted journal
 *     lines still referenced it (journal_entry_lines has no FK on
 *     (reference_type, reference_id)).
 *  5. SimpleForecastEngine writing the last period into predicted_amount while
 *     ARIMA wrote the whole-horizon total — the same column, two meanings.
 */
class MoneyIntegrityTest extends TestCase
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

        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('name');
        });
        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->integer('role_id')->nullable();
            $t->softDeletes();
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
            $t->string('source_type')->default('ap');
            $t->string('voucher_number')->nullable();
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
            // The model is timestamped; the reconciler's legacy-spelling
            // migration UPDATE writes through it, so these columns must exist.
            $t->timestamps();
        });

        DB::table('suppliers')->insert(['id' => 1, 'supplier_name' => 'Test Supplier', 'current_balance' => 0]);
    }

    /**
     * Posts the two journal lines a release would create for a disbursement,
     * which is what makes the reconciler treat it as a real payment.
     */
    private function postJournalForDisbursement(int $disbursementId, float $amount = 0.0): void
    {
        $journalId = DB::table('journal_entries')->insertGetId([
            'transaction_no' => 'DV-TEST-'.$disbursementId,
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
     * THE REGRESSION: a partial release used to leave the bill on 'Pending',
     * so the GET-side reconciler treated it as unsettled and added the same
     * amount_paid again — every single time the disbursement list was opened.
     */
    public function test_reconciliation_does_not_double_count_a_partially_paid_bill(): void
    {
        $billId = DB::table('accounts_payable')->insertGetId([
            'supplier_id' => 1, 'invoice_number' => 'AP-1', 'original_amount' => 10000,
            // EXACTLY the state releaseAp() used to leave behind after a
            // partial payment: the amount was added, the balance reduced, but
            // 'status' was written back unchanged — still 'Pending'. That
            // mismatch is what made the reconciler treat a settled bill as
            // unsettled and add the same 4000 a second time.
            'paid_amount' => 4000, 'remaining_balance' => 6000,
            'status' => 'Pending',
        ]);

        $disbursementId = DB::table('disbursements')->insertGetId([
            'ap_id' => $billId, 'status' => 'Released', 'amount_paid' => 4000,
            'released_date' => '2026-10-01',
        ]);
        $this->postJournalForDisbursement($disbursementId, 4000);

        $service = app(DisbursementService::class);

        // First pass repairs the bill.
        $service->reconcileReleasedDisbursements();
        $bill = AccountsPayable::find($billId);
        $this->assertSame('4000.00', $bill->paid_amount, 'Paid amount should equal the released disbursement, not that plus itself.');
        $this->assertSame('6000.00', $bill->remaining_balance);

        // A read must never mutate money, no matter how many times it runs.
        $service->reconcileReleasedDisbursements();
        $service->reconcileReleasedDisbursements();
        $service->reconcileReleasedDisbursements();

        $bill = AccountsPayable::find($billId);
        $this->assertSame('4000.00', $bill->paid_amount, 'Repeated reads must not keep adding the same disbursement.');
        $this->assertSame('6000.00', $bill->remaining_balance);
        $this->assertSame('Partially Paid', $bill->status);
    }

    /**
     * The reconciliation is also the repair path for rows a previous deploy
     * already corrupted, so an inflated paid_amount must be pulled back to the
     * journal-derived truth rather than preserved.
     */
    public function test_reconciliation_repairs_an_already_double_counted_bill(): void
    {
        $billId = DB::table('accounts_payable')->insertGetId([
            'supplier_id' => 1, 'invoice_number' => 'AP-2', 'original_amount' => 10000,
            // Two reads already added the same 4000 twice on top of the real one.
            'paid_amount' => 8000, 'remaining_balance' => 2000, 'status' => 'Partially Paid',
        ]);

        $disbursementId = DB::table('disbursements')->insertGetId([
            'ap_id' => $billId, 'status' => 'Released', 'amount_paid' => 4000, 'released_date' => '2026-10-01',
        ]);
        $this->postJournalForDisbursement($disbursementId, 4000);

        app(DisbursementService::class)->reconcileReleasedDisbursements();

        $bill = AccountsPayable::find($billId);
        $this->assertSame('4000.00', $bill->paid_amount);
        $this->assertSame('6000.00', $bill->remaining_balance);
        $this->assertSame('Partially Paid', $bill->status);
    }

    /**
     * THE REGRESSION: release() used to read the status off the caller-supplied
     * model before opening the transaction, and never locked the disbursement
     * row. This passes a stale model that claims 'Approved' while the database
     * says the voucher was already released — the exact interleaving two
     * concurrent PATCH /disbursements/{id}/release calls produce.
     */
    public function test_release_re_reads_status_from_the_database_inside_the_transaction(): void
    {
        $billId = DB::table('accounts_payable')->insertGetId([
            'supplier_id' => 1, 'invoice_number' => 'AP-3', 'original_amount' => 10000,
            'paid_amount' => 4000, 'remaining_balance' => 6000, 'status' => 'Partially Paid',
        ]);

        DB::table('disbursements')->insert([
            'id' => 99, 'ap_id' => $billId, 'status' => 'Released', 'amount_paid' => 4000,
            'created_by' => 7, 'released_date' => '2026-10-01',
        ]);
        $this->postJournalForDisbursement(99, 4000);

        // Stale caller-supplied model: loaded while the row was still Approved.
        $stale = (new Disbursement())->newQuery()->find(99);
        $stale->status = 'Approved';

        $this->expectException(ValidationException::class);

        try {
            app(DisbursementService::class)->release($stale, 7);
        } finally {
            // Guard against the double-release this bug allowed.
            $bill = AccountsPayable::find($billId);
            $this->assertSame('4000.00', $bill->paid_amount, 'A rejected second release must not move the payable.');
        }
    }

    /**
     * THE REGRESSION: marking a tax obligation paid with no cash_account_id
     * posted a journal entry that debited tax expense, credited a fallback
     * asset account, and never debited any cash account — a BIR payment that
     * never left the bank.
     */
    public function test_paid_tax_obligation_refuses_to_post_without_a_cash_account(): void
    {
        $obligation = new TaxObligation([
            'tax_type' => 'Percentage Tax',
            'tax_period' => '2026 Q3',
            'tax_amount' => 5000,
        ]);
        $obligation->cash_account_id = null;

        $service = app(\App\Services\TaxObligationService::class);
        $method = new \ReflectionMethod($service, 'recordAsExpense');
        $method->setAccessible(true);

        $this->expectException(ValidationException::class);
        $this->expectExceptionMessageMatches('/cash or bank account/i');

        $method->invoke($service, new \App\Models\User(['id' => 1]), $obligation);
    }

    /**
     * THE REGRESSION: journal_entry_lines stores its source as an unconstrained
     * polymorphic pair, so force-deleting the source record left posted ledger
     * lines behind. The guard must catch every spelling of reference_type the
     * column has accumulated over time, and must not confuse a different
     * entity that happens to share the same numeric id.
     */
    public function test_permanent_delete_counts_journal_lines_across_reference_type_spellings(): void
    {
        $journalId = DB::table('journal_entries')->insertGetId([
            'transaction_no' => 'JE-1', 'status' => 'Posted',
        ]);

        // Expense #15 under all three spellings that exist in the column.
        foreach (['Expenses', 'expense', 'App\\Models\\Expense'] as $type) {
            DB::table('journal_entry_lines')->insert([
                'journal_entry_id' => $journalId, 'debit' => 100, 'reference_type' => $type, 'reference_id' => 15,
            ]);
        }
        // An unrelated entity reusing the same id must not be counted.
        DB::table('journal_entry_lines')->insert([
            'journal_entry_id' => $journalId, 'debit' => 100, 'reference_type' => 'Collections', 'reference_id' => 15,
        ]);

        $this->assertSame(3, PermanentDeleteController::postedJournalLineCount('expenses', 15));
        $this->assertSame(0, PermanentDeleteController::postedJournalLineCount('expenses', 16));
        $this->assertSame(1, PermanentDeleteController::postedJournalLineCount('collections', 15));

        // Entities that carry no journal lines of their own never block.
        $this->assertSame(0, PermanentDeleteController::postedJournalLineCount('users', 15));
    }

    /**
     * THE REGRESSION: SimpleForecastEngine stored the LAST projected period
     * into predicted_amount while arima_service.py stored the sum of the whole
     * horizon, so the same column meant two different things depending on which
     * engine produced the row. Must match ARIMA: the horizon total.
     */
    public function test_simple_forecast_engine_reports_the_horizon_total_not_the_last_period(): void
    {
        $actuals = new class extends HistoricalActuals
        {
            public function forType(string $forecastType, int $maxLookbackMonths = self::MAX_LOOKBACK_MONTHS): array
            {
                return [100.0, 120.0, 140.0, 160.0, 180.0, 200.0];
            }
        };

        $engine = new SimpleForecastEngine($actuals);

        // 'next_fiscal_year' is a fixed 12-month horizon (FinancialForecastService::HORIZON_LABELS),
        // so this does not touch Settings/the database.
        $result = $engine->generate('Expenses', 'next_fiscal_year');

        $series = $engine->buildSeries('Expenses', 'next_fiscal_year', (float) $result['predicted_amount']);

        // buildSeries() labels projected points 'P1'..'P12' and historical ones 'H1'..'Hn'.
        $periodSum = 0.0;
        $periodCount = 0;
        foreach ($series as $point) {
            if (str_starts_with($point['label'], 'P')) {
                $periodSum += (float) $point['predicted'];
                $periodCount++;
            }
        }

        $this->assertSame(12, $periodCount, 'A 12-month horizon should project 12 periods.');
        $this->assertEqualsWithDelta(
            $periodSum,
            (float) $result['predicted_amount'],
            0.01,
            'predicted_amount must equal the sum of the projected periods (the ARIMA contract).'
        );

        // And it must NOT be the last period alone — that was the mismatch that
        // made the same forecast read ~12x apart depending on which engine ran.
        $lastPeriod = (float) end($series)['predicted'];
        $this->assertGreaterThan(
            $lastPeriod * 2,
            (float) $result['predicted_amount'],
            'A 12-period total must be materially larger than the final period alone.'
        );
    }
}