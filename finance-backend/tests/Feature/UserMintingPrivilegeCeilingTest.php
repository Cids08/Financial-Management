<?php

namespace Tests\Feature;

use App\Models\Collector;
use App\Models\User;
use App\Services\CollectorService;
use App\Services\UserService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Two ways a non-administrator could hand itself full access, both closed
 * here.
 *
 * 1. `guardAgainstUnauthorizedPrivilegedRoleAssignment()` used to compare the
 *    requested role against the `super-admin` slug only. But `admin` bypasses
 *    every permission check in User::hasPermission() just as thoroughly, so a
 *    caller holding `users.manage` could POST /api/users with the admin
 *    role_id, or PUT /api/users/{victim} to promote an existing account, and
 *    own the system.
 *
 * 2. `POST /api/collectors` takes an optional `user_id` and used it verbatim.
 *    Linking an existing login rewrites the `User::collector()` relation that
 *    every collector-scoped Policy keys off, so binding an administrator's
 *    login here is an authorization change, not a data-entry one.
 */
class UserMintingPrivilegeCeilingTest extends TestCase
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

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'cache.default' => 'array',
        ]);
        DB::purge('sqlite');
        Mail::fake();

        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('display_name')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('permissions', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->timestamps();
        });

        Schema::create('role_permissions', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('role_id');
            $t->unsignedInteger('permission_id');
            $t->timestamps();
        });

        Schema::create('titles', function (Blueprint $t) {
            $t->id();
            $t->string('name')->nullable();
            $t->timestamps();
        });

        Schema::create('departments', function (Blueprint $t) {
            $t->id();
            $t->string('name')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('employee_no')->nullable();
            $t->string('first_name')->nullable();
            $t->string('middle_name')->nullable();
            $t->string('last_name')->nullable();
            $t->string('suffix')->nullable();
            $t->string('email')->nullable();
            $t->string('phone_number')->nullable();
            $t->string('password')->nullable();
            $t->string('profile_photo')->nullable();
            $t->string('status')->default('Active');
            $t->unsignedInteger('role_id')->nullable();
            $t->unsignedInteger('title_id')->nullable();
            $t->unsignedInteger('department_id')->nullable();
            $t->unsignedInteger('failed_login_attempts')->default(0);
            $t->timestamp('locked_until')->nullable();
            $t->timestamp('two_factor_confirmed_at')->nullable();
            $t->boolean('must_change_password')->default(false);
            $t->unsignedInteger('updated_by')->nullable();
            $t->unsignedInteger('deleted_by')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('collectors', function (Blueprint $t) {
            $t->id();
            $t->string('employee_no')->unique()->nullable();
            $t->string('first_name')->nullable();
            $t->string('middle_name')->nullable();
            $t->string('last_name')->nullable();
            $t->string('phone_number')->nullable();
            $t->string('email')->nullable();
            $t->string('profile_photo')->nullable();
            $t->string('assigned_area')->nullable();
            $t->unsignedInteger('service_area_id')->nullable();
            $t->decimal('commission_rate', 5, 2)->default(0);
            $t->decimal('monthly_target', 15, 2)->default(0);
            $t->string('status')->default('Active');
            $t->unsignedInteger('user_id')->nullable();
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
            $t->text('new_values')->nullable();
            $t->text('old_values')->nullable();
            $t->string('ip_address')->nullable();
            $t->text('user_agent')->nullable();
            $t->timestamps();
        });

        Schema::create('activity_logs', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('user_id')->nullable();
            $t->string('activity')->nullable();
            $t->string('module')->nullable();
            $t->text('description')->nullable();
            $t->string('ip_address')->nullable();
            $t->timestamps();
        });

        // Role ids are fixed so the tests can talk about "the admin role".
        DB::table('roles')->insert([
            ['id' => 1, 'name' => 'super-admin', 'display_name' => 'Super Admin'],
            ['id' => 2, 'name' => 'admin', 'display_name' => 'Admin'],
            ['id' => 3, 'name' => 'staff', 'display_name' => 'Staff'],
            ['id' => 4, 'name' => 'collector', 'display_name' => 'Collector'],
        ]);
    }

    private const SUPER_ADMIN = 1;
    private const ADMIN = 2;
    private const STAFF = 3;
    private const COLLECTOR = 4;

    private function actor(int $roleId, string $email): User
    {
        $id = (int) DB::table('users')->max('id') + 1;
        DB::table('users')->insert([
            'id' => $id,
            'employee_no' => 'EMP-'.$id,
            'first_name' => 'Test',
            'last_name' => 'Actor',
            'email' => $email,
            'status' => 'Active',
            'role_id' => $roleId,
        ]);

        return User::find($id);
    }

    private function target(string $email, int $roleId = self::COLLECTOR): User
    {
        return $this->actor($roleId, $email);
    }

    private function createPayload(int $roleId, string $email): array
    {
        return [
            'role_id' => $roleId,
            'first_name' => 'Minted',
            'last_name' => 'Account',
            'email' => $email,
            'status' => 'Active',
        ];
    }

    public function test_a_staff_actor_cannot_mint_an_admin_account(): void
    {
        $actor = $this->actor(self::STAFF, 'staff@example.test');

        try {
            $this->app->make(UserService::class)->create($actor, $this->createPayload(self::ADMIN, 'new-admin@example.test'));
            $this->fail('A non-admin actor must not be able to mint an admin account');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('role_id', $e->errors());
        }

        $this->assertDatabaseMissing('users', ['email' => 'new-admin@example.test']);
    }

    public function test_a_staff_actor_cannot_promote_an_existing_account_to_admin(): void
    {
        $actor = $this->actor(self::STAFF, 'staff2@example.test');
        $victim = $this->target('victim@example.test');

        try {
            $this->app->make(UserService::class)->update($actor, $victim, $this->createPayload(self::ADMIN, 'victim@example.test'));
            $this->fail('A non-admin actor must not be able to promote a user to admin');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('role_id', $e->errors());
        }

        $this->assertSame(self::COLLECTOR, (int) $victim->fresh()->role_id);
    }

    public function test_a_collector_actor_cannot_mint_an_admin_account(): void
    {
        $actor = $this->actor(self::COLLECTOR, 'collector@example.test');

        $this->expectException(ValidationException::class);
        $this->app->make(UserService::class)->create($actor, $this->createPayload(self::ADMIN, 'collector-mint@example.test'));
    }

    public function test_an_admin_actor_may_still_assign_the_admin_role(): void
    {
        $actor = $this->actor(self::ADMIN, 'admin@example.test');

        $user = $this->app->make(UserService::class)->create($actor, $this->createPayload(self::ADMIN, 'legit-admin@example.test'));

        $this->assertSame(self::ADMIN, (int) $user->role_id);
        $this->assertTrue($user->hasPermission('users.manage'));
    }

    public function test_an_admin_actor_may_not_assign_the_super_admin_role(): void
    {
        // Unchanged rule, but it must survive the rework of the guard.
        $actor = $this->actor(self::ADMIN, 'admin2@example.test');

        try {
            $this->app->make(UserService::class)->create($actor, $this->createPayload(self::SUPER_ADMIN, 'escalate@example.test'));
            $this->fail('Only a Super Admin may assign the Super Admin role');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('role_id', $e->errors());
            $this->assertStringContainsString('Super Admin', $e->errors()['role_id'][0]);
        }
    }

    public function test_a_super_admin_actor_may_assign_the_super_admin_role(): void
    {
        $actor = $this->actor(self::SUPER_ADMIN, 'root@example.test');

        $user = $this->app->make(UserService::class)->create($actor, $this->createPayload(self::SUPER_ADMIN, 'second-root@example.test'));

        $this->assertSame(self::SUPER_ADMIN, (int) $user->role_id);
    }

    public function test_unprivileged_role_assignment_is_untouched(): void
    {
        $actor = $this->actor(self::STAFF, 'staff3@example.test');

        $user = $this->app->make(UserService::class)->create($actor, $this->createPayload(self::COLLECTOR, 'new-collector@example.test'));

        $this->assertSame(self::COLLECTOR, (int) $user->role_id);
    }

    public function test_a_collector_profile_cannot_be_linked_to_an_admin_login(): void
    {
        $actor = $this->actor(self::STAFF, 'staff4@example.test');
        $admin = $this->target('the-admin@example.test', self::ADMIN);

        try {
            $this->app->make(CollectorService::class)->create($actor, [
                'user_id' => $admin->id,
                'employee_no' => 'EMP-99901',
                'first_name' => 'Bound',
                'last_name' => 'Admin',
            ]);
            $this->fail('An admin login must not be linkable as a collector identity');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('user_id', $e->errors());
        }

        $this->assertDatabaseMissing('collectors', ['user_id' => $admin->id]);
    }

    public function test_an_existing_collector_profile_cannot_be_repointed_at_an_admin_login(): void
    {
        $actor = $this->actor(self::STAFF, 'staff5@example.test');
        $admin = $this->target('the-admin2@example.test', self::ADMIN);
        $legit = $this->target('legit-login@example.test', self::COLLECTOR);

        $collector = Collector::create([
            'employee_no' => 'EMP-99902',
            'first_name' => 'Real',
            'last_name' => 'Collector',
            'user_id' => $legit->id,
            'status' => 'Active',
        ]);

        try {
            $this->app->make(CollectorService::class)->update($actor, $collector, ['user_id' => $admin->id]);
            $this->fail('An admin login must not be linkable as a collector identity');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('user_id', $e->errors());
        }

        $this->assertSame($legit->id, (int) $collector->fresh()->user_id);
    }

    public function test_linking_an_ordinary_login_still_works(): void
    {
        $actor = $this->actor(self::STAFF, 'staff6@example.test');
        $legit = $this->target('ordinary-login@example.test', self::COLLECTOR);

        $collector = $this->app->make(CollectorService::class)->create($actor, [
            'user_id' => $legit->id,
            'employee_no' => 'EMP-99903',
            'first_name' => 'Fine',
            'last_name' => 'Collector',
        ]);

        $this->assertSame($legit->id, (int) $collector->user_id);
    }

    public function test_a_collector_actor_still_cannot_manage_collectors(): void
    {
        // Pre-existing denylist; pinned here so the new guards can't regress it.
        $actor = $this->actor(self::COLLECTOR, 'collector2@example.test');

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->app->make(CollectorService::class)->create($actor, [
            'employee_no' => 'EMP-99904',
            'first_name' => 'Nope',
            'last_name' => 'Collector',
        ]);
    }
}