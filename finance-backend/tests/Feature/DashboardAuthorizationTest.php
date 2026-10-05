<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\DashboardChartService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The dashboard is an aggregate endpoint: it reads Collections, Expenses,
 * Payables, Cash Accounts, Tax, Budgets, the Ledger and Forecasting in one
 * response. Each of those has its own view permission, so serving the whole
 * aggregate to whoever merely holds `dashboard.view` silently hands out
 * figures the same user is refused everywhere else.
 *
 * A `collector` is the concrete case: dashboard.view, collections.view,
 * customers.view, ar.view, collectors.view - and nothing else. They were
 * being served company-wide expense totals, total bank balances, supplier
 * disbursements and the pending-approval queue.
 *
 * These tests pin both directions of the fix: a collector no longer sees the
 * modules they lack, and a full-access admin still sees everything (the
 * gating must not quietly degrade the real dashboard).
 */
class DashboardAuthorizationTest extends TestCase
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

        $tables = [
            'users' => [fn (Blueprint $t) => $t->id()],
            'roles' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('name')],
            'permissions' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('permission_name')],
            'role_permissions' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->unsignedInteger('role_id'), fn (Blueprint $t) => $t->unsignedInteger('permission_id')],
            'customers' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status')],
            'suppliers' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status')],
            'collectors' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status')],
            'cash_accounts' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status'), fn (Blueprint $t) => $t->decimal('current_balance', 15, 2)],
            'tax_obligations' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->date('payment_date')->nullable(), fn (Blueprint $t) => $t->decimal('tax_amount', 15, 2)],
            'accounts_receivable' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status'), fn (Blueprint $t) => $t->decimal('original_amount', 15, 2), fn (Blueprint $t) => $t->decimal('remaining_balance', 15, 2), fn (Blueprint $t) => $t->date('invoice_date'), fn (Blueprint $t) => $t->date('due_date')->nullable(), fn (Blueprint $t) => $t->string('invoice_number'), fn (Blueprint $t) => $t->unsignedInteger('customer_id')->nullable(), fn (Blueprint $t) => $t->boolean('is_archived')->default(false)],
            'accounts_payable' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status'), fn (Blueprint $t) => $t->decimal('original_amount', 15, 2), fn (Blueprint $t) => $t->decimal('remaining_balance', 15, 2), fn (Blueprint $t) => $t->date('invoice_date'), fn (Blueprint $t) => $t->date('due_date')->nullable(), fn (Blueprint $t) => $t->string('invoice_number'), fn (Blueprint $t) => $t->unsignedInteger('supplier_id')->nullable(), fn (Blueprint $t) => $t->unsignedInteger('approved_by')->nullable()],
            'collections' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status'), fn (Blueprint $t) => $t->decimal('amount_received', 15, 2), fn (Blueprint $t) => $t->date('collection_date'), fn (Blueprint $t) => $t->date('due_date')->nullable(), fn (Blueprint $t) => $t->string('receipt_number'), fn (Blueprint $t) => $t->unsignedInteger('collector_id')->nullable()],
            'expenses' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status'), fn (Blueprint $t) => $t->decimal('expense_amount', 15, 2), fn (Blueprint $t) => $t->date('expense_date'), fn (Blueprint $t) => $t->string('receipt_number'), fn (Blueprint $t) => $t->string('description'), fn (Blueprint $t) => $t->boolean('is_over_budget')->default(false)],
            'disbursements' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status'), fn (Blueprint $t) => $t->decimal('amount_paid', 15, 2), fn (Blueprint $t) => $t->date('payment_date'), fn (Blueprint $t) => $t->date('due_date')->nullable(), fn (Blueprint $t) => $t->string('voucher_number'), fn (Blueprint $t) => $t->string('payee'), fn (Blueprint $t) => $t->unsignedInteger('approved_by')->nullable()],
            'budgets' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('status'), fn (Blueprint $t) => $t->string('budget_name'), fn (Blueprint $t) => $t->date('start_date'), fn (Blueprint $t) => $t->date('end_date'), fn (Blueprint $t) => $t->unsignedInteger('approved_by')->nullable()],
            'financial_forecasts' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('forecast_type'), fn (Blueprint $t) => $t->decimal('predicted_amount', 15, 2), fn (Blueprint $t) => $t->decimal('actual_amount', 15, 2)->nullable(), fn (Blueprint $t) => $t->decimal('confidence_level', 5, 2), fn (Blueprint $t) => $t->date('forecast_start')->nullable(), fn (Blueprint $t) => $t->date('forecast_end')->nullable(), fn (Blueprint $t) => $t->timestamp('generated_at')->nullable()],
            'ai_recommendations' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->text('summary')->nullable(), fn (Blueprint $t) => $t->text('recommendation')->nullable(), fn (Blueprint $t) => $t->string('category')->nullable(), fn (Blueprint $t) => $t->string('priority')->nullable(), fn (Blueprint $t) => $t->decimal('confidence_score', 5, 2)->nullable(), fn (Blueprint $t) => $t->decimal('estimated_impact', 15, 2)->nullable(), fn (Blueprint $t) => $t->timestamp('generated_at')->nullable()],
            'notifications' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->unsignedInteger('user_id')->nullable()],
            'supporting_documents' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->string('reference_type'), fn (Blueprint $t) => $t->unsignedInteger('reference_id'), fn (Blueprint $t) => $t->string('storage_path')->nullable()],
            'audit_logs' => [fn (Blueprint $t) => $t->id(), fn (Blueprint $t) => $t->unsignedInteger('user_id')->nullable(), fn (Blueprint $t) => $t->string('module')->nullable(), fn (Blueprint $t) => $t->string('action')->nullable(), fn (Blueprint $t) => $t->unsignedInteger('record_id')->nullable(), fn (Blueprint $t) => $t->text('activity_description')->nullable(), fn (Blueprint $t) => $t->text('new_values')->nullable(), fn (Blueprint $t) => $t->text('old_values')->nullable(), fn (Blueprint $t) => $t->string('ip_address')->nullable(), fn (Blueprint $t) => $t->text('user_agent')->nullable()],
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

        DB::table('customers')->insert(['id' => 1, 'status' => 'Active']);
        DB::table('suppliers')->insert(['id' => 1, 'status' => 'Active']);
        DB::table('collectors')->insert(['id' => 1, 'status' => 'Active']);
        DB::table('cash_accounts')->insert(['id' => 1, 'status' => 'Active', 'current_balance' => 1000]);
        DB::table('tax_obligations')->insert(['id' => 1, 'payment_date' => null, 'tax_amount' => 800]);
        DB::table('accounts_receivable')->insert(['id' => 1, 'status' => 'Pending', 'original_amount' => 900, 'remaining_balance' => 900, 'invoice_date' => '2026-01-15', 'due_date' => '2026-11-30', 'invoice_number' => 'AR-1', 'created_at' => now()]);
        DB::table('accounts_payable')->insert(['id' => 1, 'status' => 'Pending', 'original_amount' => 700, 'remaining_balance' => 700, 'invoice_date' => '2026-01-20', 'due_date' => '2026-11-30', 'invoice_number' => 'AP-1', 'created_at' => now()]);
        DB::table('collections')->insert(['id' => 1, 'status' => 'Confirmed', 'amount_received' => 300, 'collection_date' => '2026-01-10', 'receipt_number' => 'COL-1', 'created_at' => now()]);
        DB::table('expenses')->insert(['id' => 1, 'status' => 'Approved', 'expense_amount' => 500, 'expense_date' => '2026-01-12', 'receipt_number' => 'EXP-1', 'description' => 'Office supplies', 'created_at' => now()]);
        DB::table('disbursements')->insert(['id' => 1, 'status' => 'Released', 'amount_paid' => 400, 'payment_date' => '2026-01-18', 'voucher_number' => 'DIS-1', 'payee' => 'Supplier One', 'created_at' => now()]);
        DB::table('budgets')->insert(['id' => 1, 'status' => 'Active', 'budget_name' => 'IT Budget', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31', 'approved_by' => 1, 'created_at' => now()]);
    }

    /** Grants exactly the listed permissions to a new role and returns a user holding it. */
    private function actingAsRole(array $permissions, string $roleName = 'tester'): User
    {
        $roleId = DB::table('roles')->insertGetId(['name' => $roleName, 'created_at' => now(), 'updated_at' => now()]);

        foreach ($permissions as $permission) {
            $permissionId = DB::table('permissions')->insertGetId(['permission_name' => $permission, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('role_permissions')->insert(['role_id' => $roleId, 'permission_id' => $permissionId]);
        }

        $user = (new User())->forceFill(['id' => 1, 'role_id' => $roleId, 'must_change_password' => false]);
        $this->actingAs($user, 'sanctum');

        return $user;
    }

    /** The permissions RolesAndPermissionsSeeder actually grants each role. */
    private function collectorPermissions(): array
    {
        return ['dashboard.view', 'settings.view', 'customers.view', 'collectors.view', 'ar.view', 'collections.view', 'collections.manage'];
    }

    private function staffPermissions(): array
    {
        return [
            'dashboard.view', 'settings.view', 'customers.view', 'suppliers.view', 'collectors.view',
            'ar.view', 'collections.view', 'expenses.view', 'disbursements.view', 'budgets.view',
            'cash-accounts.view', 'general-ledger.view', 'chart-of-accounts.view', 'tax.view', 'reports.view',
            // note: no ap.view - which is exactly what this role is missing.
        ];
    }

    private function adminPermissions(): array
    {
        return [
            'dashboard.view', 'collections.view', 'expenses.view', 'cash-accounts.view', 'ap.view',
            'ar.view', 'customers.view', 'suppliers.view', 'collectors.view', 'disbursements.view',
            'tax.view', 'budgets.view', 'general-ledger.view', 'ai.view', 'forecasting.view',
        ];
    }

    public function test_collector_dashboard_omits_modules_they_cannot_view(): void
    {
        $this->actingAsRole($this->collectorPermissions(), 'collector');

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        // Permitted: collections drive revenue, and the AR/customer figures.
        $this->assertEquals(300, $data['overview']['total_revenue']['value']);
        $this->assertArrayHasKey('receivable', $data['module_cards']);
        $this->assertEquals(900, $data['module_cards']['receivable']);
        $this->assertArrayHasKey('total_customers', $data['module_cards']);

        // Not permitted: expenses, payables, cash, tax, budgets, suppliers,
        // disbursements - no key at all, and none of their figures anywhere.
        foreach (['total_expenses', 'available_cash', 'net_cash_flow'] as $forbidden) {
            $this->assertArrayNotHasKey($forbidden, $data['overview'], "overview.{$forbidden} leaked to a collector");
        }
        foreach (['cash_balance', 'payable', 'total_suppliers', 'tax_obligations', 'active_budgets', 'disbursements_today'] as $forbidden) {
            $this->assertArrayNotHasKey($forbidden, $data['module_cards'], "module_cards.{$forbidden} leaked to a collector");
        }

        // Mixed-module blocks built from modules they cannot read are withheld
        // entirely rather than partially populated.
        foreach (['recent_transactions', 'pending_approvals', 'upcoming_deadlines', 'ai_insights', 'forecast_summary'] as $forbidden) {
            $this->assertArrayNotHasKey($forbidden, $data, $forbidden.' leaked to a collector');
        }
        foreach (['summary', 'attention', 'recent_activity'] as $forbidden) {
            $this->assertArrayNotHasKey($forbidden, $data, $forbidden.' (staff aggregate) leaked to a collector');
        }

        $encoded = json_encode($data);
        foreach (['500', '700', '1000', '800', 'Supplier One', 'Office supplies'] as $secret) {
            $this->assertStringNotContainsString($secret, $encoded, "payload exposed a figure containing {$secret}");
        }
    }

    /**
     * The chart datasets are built with Postgres-only SQL (TO_CHAR and friends),
     * so /dashboard/charts cannot be exercised through the SQLite test
     * connection at all. What *can* be pinned is the filtering contract that
     * decides who receives which dataset - which is where the leak was.
     */
    public function test_every_chart_dataset_has_a_permission_mapping(): void
    {
        $expected = [
            'revenue_trend', 'expense_trend', 'cash_flow_trend', 'collections_trend',
            'budget_utilization', 'receivable_aging', 'payable_aging',
            'expense_breakdown', 'cash_distribution',
        ];

        $this->assertSame($expected, array_keys(DashboardChartService::DATASET_PERMISSIONS));
    }

    /**
     * A mistyped slug would not throw - it would silently match no role and
     * hide that chart from every user, admin included. Cross-check the mapped
     * slugs against the ones the seeder actually declares.
     */
    public function test_mapped_chart_permissions_are_real_permissions(): void
    {
        $seeder = file_get_contents(__DIR__.'/../../database/seeders/RolesAndPermissionsSeeder.php');
        preg_match_all("/'([a-z-]+\\.[a-z-]+)'\\s*=>\\s*\\[/", $seeder, $matches);
        $declared = array_unique($matches[1]);

        $this->assertNotEmpty($declared, 'failed to parse declared permissions from the seeder');

        foreach (DashboardChartService::DATASET_PERMISSIONS as $dataset => $permission) {
            $this->assertContains(
                $permission,
                $declared,
                "chart {$dataset} maps to '{$permission}', which is not a permission the seeder declares"
            );
        }
    }

    public function test_excluded_chart_datasets_are_never_queried(): void
    {
        // An empty subset returns without touching the database, which is how
        // the endpoint avoids running the Postgres-only SQL for a user who may
        // not see those datasets. On SQLite a leaked query would fail loudly.
        $this->assertSame([], (new DashboardChartService())->getAll(null, []));
    }

    public function test_admin_dashboard_still_receives_every_block(): void
    {
        $this->actingAsRole($this->adminPermissions(), 'admin');

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        foreach (['total_revenue', 'total_expenses', 'available_cash', 'net_cash_flow'] as $key) {
            $this->assertArrayHasKey($key, $data['overview'], "admin lost overview.{$key}");
        }
        $this->assertEquals(500, $data['overview']['total_expenses']['value']);
        $this->assertEquals(1000, $data['overview']['available_cash']['value']);
        $this->assertEquals(-200, $data['overview']['net_cash_flow']['value']);

        foreach (['payable', 'cash_balance', 'tax_obligations', 'active_budgets', 'disbursements_today'] as $key) {
            $this->assertArrayHasKey($key, $data['module_cards'], "admin lost module_cards.{$key}");
        }
        foreach (['recent_transactions', 'pending_approvals', 'upcoming_deadlines', 'ai_insights', 'forecast_summary', 'summary', 'attention', 'recent_activity'] as $key) {
            $this->assertArrayHasKey($key, $data, "admin lost {$key}");
        }
    }

    public function test_staff_dashboard_withholds_payables_without_ap_view(): void
    {
        $this->actingAsRole($this->staffPermissions(), 'staff');

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        // staff has ar.view / expenses.view / cash-accounts.view ...
        $this->assertEquals(900, $data['summary']['ar_outstanding']);

        // ... but not ap.view, so the AP total and AP queue are withheld.
        // Shapes are kept so the card renders an em dash and the section
        // "nothing waiting on approval" rather than breaking the page.
        $this->assertNull($data['summary']['ap_outstanding']);
        $this->assertSame([], $data['attention']['ap']);
        $this->assertArrayNotHasKey('payable', $data['module_cards'] ?? []);
    }
}