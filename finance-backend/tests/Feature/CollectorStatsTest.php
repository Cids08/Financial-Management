<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * GET /api/collectors/stats backs the four Collectors stat cards.
 *
 * It exists because the cards were previously built from the paginated
 * list's meta.total, which is the count of whatever query is on screen:
 * opening the Archived view made "Total Collectors" show the archived
 * total, "Active/Inactive" showed page-scoped slices, and the Archived
 * card itself said "—" unless you were already in that view. These tests
 * pin the contract that matters — exact all-pages figures that do not
 * move when the list filters do — plus the same scoping and permission
 * gate the list endpoint already has.
 */
class CollectorStatsTest extends TestCase
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

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('role_id')->nullable();
            $t->string('first_name')->nullable();
            $t->string('last_name')->nullable();
            $t->string('email')->nullable();
            $t->string('password')->nullable();
            $t->string('status')->nullable();
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
            $t->string('last_name')->nullable();
            $t->string('email')->nullable();
            $t->string('status')->default('Active');
            $t->unsignedInteger('updated_by')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });
    }

    /** Registers a user holding a role with exactly $permissions and authenticates it. */
    private function actingAsUser(int $userId, array $permissions, string $roleName = 'tester'): User
    {
        $roleId = DB::table('roles')->insertGetId(['name' => $roleName, 'created_at' => now(), 'updated_at' => now()]);

        foreach ($permissions as $permission) {
            $permissionId = DB::table('permissions')->insertGetId(['permission_name' => $permission, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('role_permissions')->insert(['role_id' => $roleId, 'permission_id' => $permissionId]);
        }

        $user = (new User)->forceFill([
            'id' => $userId,
            'role_id' => $roleId,
            'must_change_password' => false,
        ]);
        $this->actingAs($user, 'sanctum');

        return $user;
    }

    private function seedCollector(string $status, ?int $userId = null, bool $archived = false): void
    {
        $sequence = DB::table('collectors')->count() + 1;

        DB::table('collectors')->insert([
            'user_id' => $userId,
            'employee_no' => sprintf('EMP-%05d', $sequence),
            'first_name' => 'Test',
            'last_name' => 'Collector'.$sequence,
            'status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
            'deleted_at' => $archived ? now() : null,
        ]);
    }

    public function test_stats_report_exact_all_pages_counts_including_archived(): void
    {
        $this->actingAsUser(1, ['collectors.view']);

        $this->seedCollector('Active');
        $this->seedCollector('Active');
        $this->seedCollector('Active');
        $this->seedCollector('Inactive');
        $this->seedCollector('Inactive');
        $this->seedCollector('Active', null, true); // archived row

        $this->getJson('/api/collectors/stats')
            ->assertOk()
            ->assertJson(['success' => true, 'data' => [
                'total' => 5,      // archived rows are excluded from the live total
                'active' => 3,
                'inactive' => 2,
                'archived' => 1,
            ]]);
    }

    /**
     * The regression: these counts must not be the paginator's meta.total.
     * Whatever list filters are on the query string, the cards keep showing
     * the same exact figures.
     */
    public function test_stats_are_unchanged_by_the_list_filters(): void
    {
        $this->actingAsUser(1, ['collectors.view']);

        $this->seedCollector('Active');
        $this->seedCollector('Inactive');
        $this->seedCollector('Active', null, true);

        $expected = ['total' => 2, 'active' => 1, 'inactive' => 1, 'archived' => 1];

        $this->getJson('/api/collectors/stats?archived=1&status=active&search=zzz-no-match')
            ->assertOk()
            ->assertJson(['data' => $expected]);

        $this->getJson('/api/collectors/stats?archived=0&status=inactive')
            ->assertOk()
            ->assertJson(['data' => $expected]);
    }

    /** Mirrors index(): a collector-role user only ever counts their own row. */
    public function test_stats_are_scoped_to_the_own_row_for_collector_role_users(): void
    {
        $this->actingAsUser(11, ['collectors.view'], 'collector');

        $this->seedCollector('Active', 11);   // this collector's own row
        $this->seedCollector('Active', 11, true); // and its archived sibling
        $this->seedCollector('Active', 12);   // someone else's
        $this->seedCollector('Inactive', 12);

        $this->getJson('/api/collectors/stats')
            ->assertOk()
            ->assertJson(['data' => ['total' => 1, 'active' => 1, 'inactive' => 0, 'archived' => 1]]);
    }

    public function test_stats_require_the_collectors_view_permission(): void
    {
        $this->actingAsUser(1, ['dashboard.view']);

        $this->seedCollector('Active');

        $this->getJson('/api/collectors/stats')->assertForbidden();
    }
}
