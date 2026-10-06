<?php

namespace Tests\Feature;

use App\Http\Requests\UpdateCashAccountRequest;
use App\Models\CashAccount;
use App\Models\User;
use App\Services\AccountsPayableService;
use App\Services\CashAccountService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use RuntimeException;

/**
 * Two ways a cash account's running balance could be made to lie.
 *
 * 1. It was accepted straight from the edit form — UpdateCashAccountRequest
 *    allowed `current_balance`, and CashAccountService::update() spread
 *    $data into the model where the column is $fillable. Typing a number moved
 *    the Cash Accounts page, the dashboard's "Cash on Hand", and every
 *    insufficient-funds gate (AP payment run, disbursements, expenses, tax
 *    payments) while leaving the journal-derived balance on the linked chart of
 *    accounts untouched, with no audit record.
 *
 * 2. executePaymentRun() took its lockForUpdate() and funds check *before*
 *    DB::transaction() opened, so under autocommit the row lock was released
 *    the instant that statement ended: two concurrent runs could both pass
 *    against the same balance. It also never checked that the account was
 *    Active, unlike every other money path.
 */
class CashAccountBalanceIntegrityTest extends TestCase
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

        // Isolated SQLite only; the real migration chain is PostgreSQL SQL.
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');

        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('employee_no')->nullable();
            $t->string('first_name')->nullable();
            $t->string('last_name')->nullable();
            $t->string('email')->nullable();
            $t->string('password')->nullable();
            $t->string('status')->default('Active');
            $t->unsignedInteger('role_id')->nullable();
            $t->unsignedInteger('updated_by')->nullable();
            $t->unsignedInteger('deleted_by')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('cash_accounts', function (Blueprint $t) {
            $t->id();
            $t->string('account_code')->nullable();
            $t->string('account_name');
            $t->string('bank_name')->nullable();
            $t->string('branch_name')->nullable();
            $t->string('account_number')->nullable();
            $t->string('swift_code')->nullable();
            $t->string('account_type')->nullable();
            $t->string('currency')->default('PHP');
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

        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('user_id')->nullable();
            $t->string('module')->nullable();
            $t->string('action')->nullable();
            $t->unsignedInteger('record_id')->nullable();
            $t->text('activity_description')->nullable();
            $t->text('old_values')->nullable();
            $t->text('new_values')->nullable();
            $t->string('ip_address')->nullable();
            $t->text('user_agent')->nullable();
            $t->timestamps();
        });

        DB::table('roles')->insert(['id' => 1, 'name' => 'admin']);
        DB::table('users')->insert([
            'id' => 1,
            'email' => 'admin@example.test',
            'first_name' => 'Ada',
            'last_name' => 'Admin',
            'password' => Hash::make('secret'),
            'status' => 'Active',
            'role_id' => 1,
        ]);
    }

    private function actor(): User
    {
        return User::find(1);
    }

    private function account(string $balance = '1000.00', string $status = 'Active'): CashAccount
    {
        $id = (int) DB::table('cash_accounts')->max('id') + 1;
        DB::table('cash_accounts')->insert([
            'id' => $id,
            'account_code' => 'CA-'.$id,
            'account_name' => 'BDO Checking',
            'account_number' => '0000-'.$id,
            'account_type' => 'Checking',
            'opening_balance' => $balance,
            'current_balance' => $balance,
            'status' => $status,
        ]);

        return CashAccount::find($id);
    }

    // ---------------------------------------------------------------- finding A

    public function test_an_edit_cannot_overwrite_the_derived_balance(): void
    {
        $account = $this->account('1000.00');

        $this->app->make(CashAccountService::class)->update($this->actor(), $account, [
            'account_name'   => 'Renamed Checking',
            'account_number' => '0000-1',
            'account_type'   => 'Checking',
            // Exactly what the old edit form sent.
            'current_balance' => '999999.00',
        ]);

        $fresh = $account->fresh();
        $this->assertSame('1000.00', $fresh->current_balance);
        $this->assertSame('Renamed Checking', $fresh->account_name);
    }

    public function test_an_edit_cannot_overwrite_the_opening_balance(): void
    {
        $account = $this->account('1000.00');

        $this->app->make(CashAccountService::class)->update($this->actor(), $account, [
            'account_name'     => 'Renamed Checking',
            'account_number'   => '0000-1',
            'account_type'     => 'Checking',
            'opening_balance'  => '0.00',
        ]);

        $this->assertSame('1000.00', $account->fresh()->opening_balance);
    }

    public function test_the_opening_balance_is_still_settable_at_creation(): void
    {
        // The balance must remain an *input* on create — that is the only
        // legitimate way to seed it.
        $account = $this->app->make(CashAccountService::class)->create($this->actor(), [
            'account_name'    => 'New Account',
            'account_number'  => '9999-1',
            'account_type'    => 'Savings',
            'current_balance' => '5000.00',
            'status'          => 'Active',
        ]);

        $this->assertSame('5000.00', $account->current_balance);
        $this->assertSame('5000.00', $account->opening_balance);
    }

    public function test_the_update_request_rejects_a_supplied_balance(): void
    {
        $rules = (new UpdateCashAccountRequest())->rules();

        $this->assertSame(['prohibited'], $rules['current_balance']);
        $this->assertSame(['prohibited'], $rules['opening_balance']);

        // And the rule actually rejects it, so an API client gets a 422
        // rather than a silent no-op.
        $validator = Validator::make([
            'account_name'   => 'Renamed',
            'account_number' => '0000-1',
            'account_type'   => 'Checking',
            'current_balance' => 999999,
        ], $rules);

        $this->assertTrue($validator->fails());
        $this->assertArrayHasKey('current_balance', $validator->errors()->toArray());
    }

    public function test_an_edit_is_audited(): void
    {
        $account = $this->account('1000.00');

        $this->app->make(CashAccountService::class)->update($this->actor(), $account, [
            'account_name'   => 'Renamed Checking',
            'account_number' => '0000-1',
            'account_type'   => 'Checking',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'module' => 'Cash Accounts',
            'action' => 'update',
            'record_id' => $account->id,
            'user_id' => 1,
        ]);
    }

    // ---------------------------------------------------------------- finding B

    private function paymentRun(int $cashAccountId, array $proposals = null): AccountsPayableService
    {
        return $this->app->make(AccountsPayableService::class);
    }

    public function test_the_payment_run_refuses_an_inactive_cash_account(): void
    {
        $account = $this->account('100000.00', 'Inactive');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('is not active');

        $this->paymentRun($account->id)->executePaymentRun($this->actor(), [
            'cash_account_id' => $account->id,
            'payment_method'  => 'Bank Transfer',
            'payment_date'    => now()->toDateString(),
            'proposals'       => [],
        ]);
    }

    public function test_the_payment_run_refuses_to_overspend_the_balance(): void
    {
        $account = $this->account('1000.00');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Insufficient cash account balance');

        // Rejected on the cash check, which runs before the proposal loop,
            // so this does not need the bill/disbursement schema. The ap_id
            // deliberately does not exist — reaching it would be the bug.
            $this->paymentRun($account->id)->executePaymentRun($this->actor(), [
                'cash_account_id' => $account->id,
                'payment_method'  => 'Bank Transfer',
                'payment_date'    => now()->toDateString(),
                'proposals'       => [
                    ['ap_id' => 999999, 'amount_to_pay' => 4000.00],
                    ['ap_id' => 999998, 'amount_to_pay' => 4000.00],
                ],
            ]);
    }

    public function test_the_funds_check_runs_inside_the_transaction(): void
    {
        // Guards the specific defect: the lockForUpdate() and balance check
        // used to sit *before* DB::transaction(), where a Postgres row lock is
        // released the moment the statement completes — making the lock
        // decorative and the check racy.
        $source = file_get_contents(app_path('Services/AccountsPayableService.php'));
        $start = strpos($source, 'public function executePaymentRun');
        $this->assertNotFalse($start);

        $body = substr($source, $start);
        $transactionAt = strpos($body, 'DB::transaction(');
        $lockAt = strpos($body, 'CashAccount::lockForUpdate()');
        $balanceCheckAt = strpos($body, 'current_balance');

        $this->assertNotFalse($lockAt, 'cash account should still be locked');
        $this->assertNotFalse($balanceCheckAt, 'balance should still be checked');
        $this->assertTrue(
            $transactionAt < $lockAt,
            'DB::transaction() must open before the cash account is locked, or the lock is a no-op'
        );
        $this->assertTrue(
            $transactionAt < $balanceCheckAt,
            'DB::transaction() must open before the balance is read, or the check is racy'
        );
    }
}