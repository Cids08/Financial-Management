<?php

namespace Tests\Feature;

use App\Exceptions\AccountLockedException;
use App\Services\AuthService;
use App\Services\GeoIpService;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * The 6-digit login code is the second factor, so it has to hold up against
 * guessing. It previously did not: verifyLoginTwoFactor() compared the code
 * and threw, with no counter of any kind. The only bound was throttle:5,1 per
 * source IP on the route, and resendLoginTwoFactor() reissued a fresh code
 * against the same pending ticket - so an attacker rotating addresses had
 * nothing at all bounding attempts against a single account.
 *
 * These tests pin that wrong codes now consume the same failed_login_attempts
 * budget as wrong passwords, that the lock is enforced *before* the code is
 * compared, and that the pending ticket dies with the lock.
 */
class TwoFactorBruteForceTest extends TestCase
{
    private const TOKEN = 'pending-token-for-tests';

    private const CODE = '123456';

    public function createApplication()
    {
        $app = require __DIR__.'/../../bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'cache.default' => 'array',
        ]);
        DB::purge('sqlite');
        Mail::fake();

        // No network lookups in a unit test.
        $this->app->instance(GeoIpService::class, new class extends GeoIpService
        {
            public function locate(?string $ip): ?string
            {
                return 'Test Location';
            }
        });

        $tables = [
            'departments' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('name')->nullable()],
            'roles' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('name')->nullable()],
            'users' => [
                fn (Blueprint $t) => $t->id(),
                fn (Blueprint $t) => $t->string('email')->nullable(),
                fn (Blueprint $t) => $t->string('first_name')->nullable(),
                fn (Blueprint $t) => $t->string('last_name')->nullable(),
                fn (Blueprint $t) => $t->string('status')->default('Active'),
                fn (Blueprint $t) => $t->string('password')->nullable(),
                fn (Blueprint $t) => $t->unsignedInteger('failed_login_attempts')->default(0),
                fn (Blueprint $t) => $t->timestamp('locked_until')->nullable(),
                fn (Blueprint $t) => $t->timestamp('two_factor_confirmed_at')->nullable(),
                fn (Blueprint $t) => $t->timestamp('last_login')->nullable(),
                fn (Blueprint $t) => $t->unsignedInteger('role_id')->nullable(),
                fn (Blueprint $t) => $t->unsignedInteger('department_id')->nullable(),
            ],
            'personal_access_tokens' => [
                fn (Blueprint $t) => $t->id(),
                fn (Blueprint $t) => $t->morphs('tokenable'),
                fn (Blueprint $t) => $t->string('name'),
                fn (Blueprint $t) => $t->string('token', 64)->unique(),
                fn (Blueprint $t) => $t->text('abilities')->nullable(),
                fn (Blueprint $t) => $t->timestamp('last_used_at')->nullable(),
                fn (Blueprint $t) => $t->timestamp('expires_at')->nullable(),
                fn (Blueprint $t) => $t->string('ip_address')->nullable(),
                fn (Blueprint $t) => $t->text('user_agent')->nullable(),
                fn (Blueprint $t) => $t->string('location')->nullable(),
            ],
            'audit_logs' => [
                fn (Blueprint $t) => $t->id(),
                fn (Blueprint $t) => $t->unsignedInteger('user_id')->nullable(),
                fn (Blueprint $t) => $t->string('module')->nullable(),
                fn (Blueprint $t) => $t->string('action')->nullable(),
                fn (Blueprint $t) => $t->unsignedInteger('record_id')->nullable(),
                fn (Blueprint $t) => $t->text('activity_description')->nullable(),
                fn (Blueprint $t) => $t->text('new_values')->nullable(),
                fn (Blueprint $t) => $t->text('old_values')->nullable(),
                fn (Blueprint $t) => $t->string('ip_address')->nullable(),
                fn (Blueprint $t) => $t->text('user_agent')->nullable(),
            ],
            'activity_logs' => [
                fn (Blueprint $t) => $t->id(),
                fn (Blueprint $t) => $t->unsignedInteger('user_id')->nullable(),
                fn (Blueprint $t) => $t->string('activity')->nullable(),
                fn (Blueprint $t) => $t->string('module')->nullable(),
                fn (Blueprint $t) => $t->text('description')->nullable(),
                fn (Blueprint $t) => $t->string('ip_address')->nullable(),
            ],
        ];

        foreach ($tables as $table => $columns) {
            Schema::create($table, function (Blueprint $t) use ($columns) {
                foreach ($columns as $column) {
                    $column($t);
                }
                $t->timestamps();
                $t->softDeletes();
            });
        }

        DB::table('departments')->insert(['id' => 1, 'name' => 'Finance']);
        DB::table('roles')->insert(['id' => 1, 'name' => 'admin']);
        DB::table('users')->insert([
            'id' => 1,
            'email' => 'admin@example.test',
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'status' => 'Active',
            'password' => Hash::make('correct-password'),
            'failed_login_attempts' => 0,
            'role_id' => 1,
            'department_id' => 1,
        ]);
    }

    /** Seeds a password-verified pending ticket with a known code. */
    private function issuePendingTicket(string $code = self::CODE): void
    {
        Cache::put('login-pending:'.self::TOKEN, ['user_id' => 1, 'remember' => false], now()->addMinutes(10));
        Cache::put('login-2fa:'.self::TOKEN, Hash::make($code), now()->addMinutes(5));
    }

    private function service(): AuthService
    {
        return $this->app->make(AuthService::class);
    }

    private function attempts(): int
    {
        return (int) DB::table('users')->where('id', 1)->value('failed_login_attempts');
    }

    public function test_a_wrong_code_counts_toward_the_failed_attempt_budget(): void
    {
        $this->issuePendingTicket();

        try {
            $this->service()->verifyLoginTwoFactor(self::TOKEN, '000000');
            $this->fail('A wrong code should not verify');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('code', $e->errors());
        }

        $this->assertSame(1, $this->attempts());
    }

    public function test_repeated_wrong_codes_lock_the_account_and_burn_the_ticket(): void
    {
        $max = 5; // AuthService::MAX_FAILED_ATTEMPTS

        for ($i = 1; $i < $max; $i++) {
            $this->issuePendingTicket();

            try {
                $this->service()->verifyLoginTwoFactor(self::TOKEN, '000000');
                $this->fail('A wrong code should not verify');
            } catch (ValidationException $e) {
                $this->assertNotEmpty($e->errors());
            }

            $this->assertFalse($this->isLocked(), "attempt {$i} must not lock yet");
        }

        // The attempt that trips the lock.
        $this->issuePendingTicket();

        try {
            $this->service()->verifyLoginTwoFactor(self::TOKEN, '000000');
            $this->fail('The locking attempt should throw AccountLockedException');
        } catch (AccountLockedException $e) {
            $this->assertGreaterThan(0, $e->secondsRemaining);
        }

        $this->assertTrue($this->isLocked());
        $this->assertTrue(DB::table('users')->where('id', 1)->value('locked_until') !== null);

        // The pending ticket must not survive the lock, otherwise the same code
        // window is still open the moment the lock expires.
        $this->assertNull(Cache::get('login-pending:'.self::TOKEN));
        $this->assertNull(Cache::get('login-2fa:'.self::TOKEN));
    }

    public function test_a_locked_account_is_refused_before_the_code_is_even_compared(): void
    {
        // The *correct* code is submitted, so this can only be refused if the
        // lock is enforced ahead of the comparison.
        $this->issuePendingTicket();
        DB::table('users')->where('id', 1)->update(['locked_until' => now()->addMinutes(15)]);

        $this->expectException(AccountLockedException::class);
        $this->service()->verifyLoginTwoFactor(self::TOKEN, self::CODE);
    }

    public function test_a_resend_is_refused_while_the_account_is_locked(): void
    {
        $this->issuePendingTicket();
        DB::table('users')->where('id', 1)->update(['locked_until' => now()->addMinutes(15)]);

        try {
            $this->service()->resendLoginTwoFactor(self::TOKEN);
            $this->fail('A locked account must not receive a fresh code');
        } catch (AccountLockedException $e) {
            $this->assertGreaterThan(0, $e->secondsRemaining);
        }

        Mail::assertNothingSent();
    }

    public function test_the_correct_code_still_verifies_and_clears_prior_failures(): void
    {
        $this->issuePendingTicket();

        // One prior failure, then the right code.
        try {
            $this->service()->verifyLoginTwoFactor(self::TOKEN, '000000');
        } catch (ValidationException) {
            // expected
        }
        $this->assertSame(1, $this->attempts());

        $this->issuePendingTicket();

        $result = $this->service()->verifyLoginTwoFactor(self::TOKEN, self::CODE);

        $this->assertArrayHasKey('token', $result);
        $this->assertNotEmpty($result['token']);
        $this->assertSame(1, $result['user']->id);

        // The success clears the budget, so a later typo does not start from 1.
        $this->assertSame(0, $this->attempts());

        // Ticket consumed - a replay of the same code must not log in again.
        $this->assertNull(Cache::get('login-pending:'.self::TOKEN));
        $this->expectException(ValidationException::class);
        $this->service()->verifyLoginTwoFactor(self::TOKEN, self::CODE);
    }

    public function test_an_expired_or_unknown_ticket_is_still_rejected(): void
    {
        $this->expectException(ValidationException::class);
        $this->service()->verifyLoginTwoFactor('never-issued', self::CODE);
    }

    private function isLocked(): bool
    {
        $lockedUntil = DB::table('users')->where('id', 1)->value('locked_until');

        return $lockedUntil !== null && \Carbon\Carbon::parse($lockedUntil)->isFuture();
    }
}