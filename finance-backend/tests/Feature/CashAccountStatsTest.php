<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * GET /api/cash-accounts/stats backs the Cash Accounts stat cards.
 *
 * The cards used the paginated list's meta.total, so "Archived" could only
 * show a number while you were already in the archived view (rendering a
 * dash otherwise), and "Total Accounts" then showed the archived total
 * instead of the real one. These tests pin exact all-pages counts that do
 * not move with the search/type/archived list filters.
 */
class CashAccountStatsTest extends TestCase
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

        Schema::create('cash_accounts', function (Blueprint $t) {
            $t->id();
            $t->string('account_code')->nullable();
            $t->string('account_name')->nullable();
            $t->string('account_type')->nullable();
            $t->string('status')->default('Active');
            $t->decimal('current_balance', 15, 2)->default(0);
            $t->unsignedInteger('updated_by')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });
    }

    private function actingAsUser(int $userId, array $permissions): User
    {
        $roleId = DB::table('roles')->insertGetId(['name' => 'tester', 'created_at' => now(), 'updated_at' => now()]);

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

    private function seedAccount(string $status, bool $archived = false): void
    {
        $sequence = DB::table('cash_accounts')->count() + 1;

        DB::table('cash_accounts')->insert([
            'account_code' => sprintf('CA-%03d', $sequence),
            'account_name' => 'Account '.$sequence,
            'status' => $status,
            'current_balance' => 1000,
            'created_at' => now(),
            'updated_at' => now(),
            'deleted_at' => $archived ? now() : null,
        ]);
    }

    public function test_stats_report_exact_all_pages_counts_including_archived(): void
    {
        $this->actingAsUser(1, ['cash-accounts.view']);

        $this->seedAccount('Active');
        $this->seedAccount('Active');
        $this->seedAccount('Inactive');
        $this->seedAccount('Inactive', true); // archived

        $this->getJson('/api/cash-accounts/stats')
            ->assertOk()
            ->assertJson(['success' => true, 'data' => [
                'total' => 3,
                'active' => 2,
                'inactive' => 1,
                'archived' => 1,
            ]]);
    }

    public function test_stats_are_unchanged_by_the_list_filters(): void
    {
        $this->actingAsUser(1, ['cash-accounts.view']);

        $this->seedAccount('Active');
        $this->seedAccount('Inactive', true);

        $expected = ['total' => 1, 'active' => 1, 'inactive' => 0, 'archived' => 1];

        $this->getJson('/api/cash-accounts/stats?archived=1&search=no-match&type=Savings')
            ->assertOk()
            ->assertJson(['data' => $expected]);

        $this->getJson('/api/cash-accounts/stats?archived=0')
            ->assertOk()
            ->assertJson(['data' => $expected]);
    }

    public function test_stats_require_the_cash_accounts_view_permission(): void
    {
        $this->actingAsUser(1, ['dashboard.view']);

        $this->seedAccount('Active');

        $this->getJson('/api/cash-accounts/stats')->assertForbidden();
    }
}
