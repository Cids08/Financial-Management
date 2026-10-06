<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;

/**
 * Email and employee-number uniqueness across users and collectors.
 *
 * The two tables disagree about what "unique" means, and validation has to
 * mirror each one exactly:
 *
 *   users.email / users.employee_no — plain unique indexes. An archived
 *   user keeps both forever, so nothing may be recycled. A rule that
 *   skipped archived rows passed validation and then blew up with an
 *   unhandled QueryException (HTTP 500) at insert time.
 *
 *   collectors.employee_no / collectors.user_id — partial indexes
 *   (WHERE deleted_at IS NULL), so archiving releases them.
 *
 * These tests pin both the 422-with-a-readable-message outcome and the
 * plain "this is already in use" wording the admin sees.
 */
class EmailUniquenessTest extends TestCase
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
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');
        Mail::fake();

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('role_id')->nullable();
            $t->unsignedInteger('title_id')->nullable();
            $t->string('employee_no')->unique();
            $t->string('first_name')->nullable();
            $t->string('middle_name')->nullable();
            $t->string('last_name')->nullable();
            $t->string('phone_number')->nullable();
            $t->string('email')->unique();
            $t->string('password')->nullable();
            $t->string('status')->default('Active');
            $t->boolean('must_change_password')->default(false);
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('permissions', function (Blueprint $t) {
            $t->id();
            $t->string('permission_name');
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('role_permissions', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('role_id');
            $t->unsignedInteger('permission_id');
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('collectors', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('user_id')->nullable();
            $t->string('employee_no')->nullable();
            $t->string('first_name')->nullable();
            $t->string('middle_name')->nullable();
            $t->string('last_name')->nullable();
            $t->string('phone_number')->nullable();
            $t->string('email')->nullable();
            $t->string('assigned_area')->nullable();
            $t->unsignedInteger('service_area_id')->nullable();
            $t->decimal('commission_rate', 5, 2)->nullable();
            $t->decimal('monthly_target', 12, 2)->nullable();
            $t->string('status')->default('Active');
            $t->unsignedInteger('updated_by')->nullable();
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

        DB::table('roles')->insert(['id' => 1, 'name' => 'collector', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function actingAsManager(array $permissions): User
    {
        $roleId = DB::table('roles')->insertGetId(['name' => 'tester', 'created_at' => now(), 'updated_at' => now()]);

        foreach ($permissions as $permission) {
            $permissionId = DB::table('permissions')->insertGetId(['permission_name' => $permission, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('role_permissions')->insert(['role_id' => $roleId, 'permission_id' => $permissionId]);
        }

        $user = (new User)->forceFill(['id' => 1, 'role_id' => $roleId, 'must_change_password' => false]);
        $this->actingAs($user, 'sanctum');

        return $user;
    }

    private function seedUser(string $email, string $employeeNo, bool $archived = false): void
    {
        DB::table('users')->insert([
            'role_id' => 1,
            'employee_no' => $employeeNo,
            'first_name' => 'Existing',
            'last_name' => 'Person',
            'email' => $email,
            'password' => 'secret',
            'status' => 'Active',
            'created_at' => now(),
            'updated_at' => now(),
            'deleted_at' => $archived ? now() : null,
        ]);
    }

    public function test_user_creation_rejects_a_duplicate_email_with_a_readable_message(): void
    {
        $this->actingAsManager(['users.manage']);
        $this->seedUser('taken@example.com', 'EMP-00001');

        $response = $this->postJson('/api/users', [
            'first_name' => 'New',
            'last_name' => 'Person',
            'email' => 'taken@example.com',
            'role_id' => 1,
            'title_id' => null,
            'status' => 'Active',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('already in use', $response->json('message'));
        $response->assertJsonValidationErrors('email');
    }

    /**
     * The archived user still owns their email (users.email is a plain
     * unique index), so this must be a 422 — never an insert-time 500.
     */
    public function test_user_creation_rejects_the_email_of_an_archived_user(): void
    {
        $this->actingAsManager(['users.manage']);
        $this->seedUser('old.person@example.com', 'EMP-00002', true);

        $response = $this->postJson('/api/users', [
            'first_name' => 'New',
            'last_name' => 'Person',
            'email' => 'old.person@example.com',
            'role_id' => 1,
            'title_id' => null,
            'status' => 'Active',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('already in use', $response->json('message'));
    }

    /**
     * This is the path that used to 500: StoreCollectorRequest skipped
     * archived users in its email rule while the DB index did not.
     */
    public function test_collector_creation_rejects_the_email_of_an_archived_user(): void
    {
        $this->actingAsManager(['collectors.manage']);
        $this->seedUser('old.collector@example.com', 'EMP-00003', true);

        $response = $this->postJson('/api/collectors', [
            'employee_no' => 'EMP-09001',
            'first_name' => 'New',
            'last_name' => 'Collector',
            'email' => 'old.collector@example.com',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('already in use', $response->json('message'));
        $response->assertJsonValidationErrors('email');
    }

    /** An archived user's employee number is equally unavailable. */
    public function test_collector_creation_rejects_the_employee_number_of_an_archived_user(): void
    {
        $this->actingAsManager(['collectors.manage']);
        $this->seedUser('someone@example.com', 'EMP-00004', true);

        $response = $this->postJson('/api/collectors', [
            'employee_no' => 'EMP-00004',
            'first_name' => 'New',
            'last_name' => 'Collector',
            'email' => 'fresh.collector@example.com',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('already in use', $response->json('message'));
        $response->assertJsonValidationErrors('employee_no');
    }

    /**
     * The other half of the contract: an archived COLLECTOR does release
     * its number (partial index), so the same input succeeds.
     */
    public function test_collector_creation_accepts_the_number_released_by_an_archived_collector(): void
    {
        $this->actingAsManager(['collectors.manage']);

        DB::table('collectors')->insert([
            'employee_no' => 'EMP-09002',
            'first_name' => 'Departed',
            'last_name' => 'Collector',
            'status' => 'Active',
            'created_at' => now(),
            'updated_at' => now(),
            'deleted_at' => now(),
        ]);

        $this->postJson('/api/collectors', [
            'employee_no' => 'EMP-09002',
            'first_name' => 'New',
            'last_name' => 'Collector',
            'email' => 'new.collector@example.com',
        ])->assertCreated();

        $this->assertDatabaseHas('collectors', [
            'employee_no' => 'EMP-09002',
            'deleted_at' => null,
        ]);
    }

    /**
     * The Add Collector form no longer demands a number: blank means "mint
     * one", using the same sequence the Users page already uses.
     */
    public function test_collector_creation_mints_an_employee_number_when_left_blank(): void
    {
        $this->actingAsManager(['collectors.manage']);

        $response = $this->postJson('/api/collectors', [
            'first_name' => 'New',
            'last_name' => 'Collector',
            'email' => 'minted.collector@example.com',
        ]);

        $response->assertCreated();

        $employeeNo = $response->json('data.employee_no');
        $this->assertMatchesRegularExpression('/^EMP-\d{5}$/', $employeeNo);

        $this->assertDatabaseHas('collectors', ['employee_no' => $employeeNo, 'deleted_at' => null]);
        // The auto-created login carries the identical number — one person,
        // one employee number, no matter which page created them.
        $this->assertDatabaseHas('users', [
            'employee_no' => $employeeNo,
            'email' => 'minted.collector@example.com',
        ]);
    }

    /** A profile linked to an existing login inherits that login's number. */
    public function test_collector_creation_inherits_the_linked_accounts_employee_number(): void
    {
        $this->actingAsManager(['collectors.manage']);
        $this->seedUser('linked@example.com', 'EMP-00077');

        $linkedUserId = (int) DB::table('users')->where('email', 'linked@example.com')->value('id');

        $response = $this->postJson('/api/collectors', [
            'first_name' => 'Linked',
            'last_name' => 'Collector',
            'email' => null,
            'user_id' => $linkedUserId,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('collectors', [
            'employee_no' => 'EMP-00077',
            'user_id' => $linkedUserId,
            'deleted_at' => null,
        ]);
    }

    /** Blank on edit means "unchanged", never "erase the number". */
    public function test_updating_a_collector_without_resending_the_number_keeps_it(): void
    {
        $this->actingAsManager(['collectors.manage']);

        $this->postJson('/api/collectors', [
            'first_name' => 'Steady',
            'last_name' => 'Collector',
            'email' => 'steady.collector@example.com',
        ])->assertCreated();

        $id = (int) DB::table('collectors')->where('email', 'steady.collector@example.com')->value('id');
        $employeeNo = DB::table('collectors')->where('id', $id)->value('employee_no');

        $this->putJson("/api/collectors/{$id}", [
            'first_name' => 'Steady',
            'last_name' => 'Collector Renamed',
            'employee_no' => null,
        ])->assertOk();

        $this->assertDatabaseHas('collectors', [
            'id' => $id,
            'employee_no' => $employeeNo,
        ]);
        $this->assertDatabaseHas('collectors', ['id' => $id, 'last_name' => 'Collector Renamed']);
    }
}
