<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * SINGLE SOURCE OF TRUTH. Every permission_name below matches the actual
 * live routes/api.php ->middleware('permission:...') calls, checked
 * directly against that file.
 *
 * `permissions.module` has a Postgres CHECK constraint limiting it to
 * exactly: Administration, Accounts Receivable, Accounts Payable,
 * Budget Management, Accounting, Forecasting, Reports, System Settings.
 *
 * Role access:
 *   super-admin, admin — both get EVERY permission that exists, on EVERY
 *     run, no exceptions.
 *   staff, collector — always synced to EXACTLY the permission list below
 *     on every boot (sync(), not syncWithoutDetaching). The seeder is the
 *     single source of truth: any extra permissions manually granted to
 *     these roles via the Roles UI will be stripped on the next redeploy.
 *     User accounts and role assignments are NOT affected — only the
 *     permission list attached to the role itself is reset.
 *
 * disbursements.* and budgets.* are SEPARATE permission groups (both
 * under the "Budget Management" DB module — distinct permission_name
 * values, independently assignable).
 *
 * audit-logs.view is NOT part of staff/collector's default list —
 * Admin-tier by design. Grant manually via Roles.jsx if needed.
 *
 * PRUNING: permission_name values not in the canonical list below are
 * deleted (pivot rows first) — cleans up orphaned rows from prior
 * naming conventions.
 *
 * Re-run safe: permissions and role records always sync. Role-to-
 * permission assignment for staff/collector is also always reset to
 * exactly the list below.
 */
class RolesAndPermissionsSeeder extends Seeder
{
    /** permission_name => [display label, DB module (constrained)] */
    protected array $permissions = [
        // System Settings
        'settings.view' => ['View Settings', 'System Settings'],
        'settings.manage' => ['Manage Settings', 'System Settings'],

        // Dashboard — every role gets this permission now (one route, but
        // DashboardController must branch on the user's role/permissions
        // to return different content for staff/collector vs admin — see
        // flag in chat, this only controls whether the route is reachable
        // at all, not what data comes back).
        'dashboard.view' => ['View Dashboard', 'Administration'],

        // User Management
        'users.view' => ['View Users', 'Administration'],
        'users.manage' => ['Manage Users', 'Administration'],
        'roles.view' => ['View Roles', 'Administration'],
        'roles.manage' => ['Manage Roles', 'Administration'],

        // Audit Logs — system-wide, read-only trail across every module
        // (Tax Obligations, Expenses, etc.), not tied to any one module's
        // own permission. See class docblock for why this stays off
        // staff/collector's default list.
        'audit-logs.view' => ['View Audit Logs', 'Administration'],

        // Master Data
        'departments.view' => ['View Departments', 'Administration'],
        'departments.manage' => ['Manage Departments', 'Administration'],
        'customers.view' => ['View Customers', 'Administration'],
        'customers.manage' => ['Manage Customers', 'Administration'],
        'suppliers.view' => ['View Suppliers', 'Administration'],
        'suppliers.manage' => ['Manage Suppliers', 'Administration'],
        'collectors.view' => ['View Collectors', 'Administration'],
        'collectors.manage' => ['Manage Collectors', 'Administration'],
        'cash-accounts.view' => ['View Cash Accounts', 'Administration'],
        'cash-accounts.manage' => ['Manage Cash Accounts', 'Administration'],
        'fixed-assets.view' => ['View Fixed Assets', 'Administration'],
        'fixed-assets.manage' => ['Manage Fixed Assets', 'Administration'],
        'expense-categories.view' => ['View Expense Categories', 'Administration'],
        'expense-categories.manage' => ['Manage Expense Categories', 'Administration'],
        'service-areas.view' => ['View Service Areas', 'Administration'],
        'service-areas.manage' => ['Manage Service Areas', 'Administration'],

        // Accounts Receivable
        'ar.view' => ['View Accounts Receivable', 'Accounts Receivable'],
        'ar.manage' => ['Manage Accounts Receivable', 'Accounts Receivable'],
        'collections.view' => ['View Collections', 'Accounts Receivable'],
        'collections.manage' => ['Manage Collections', 'Accounts Receivable'],
        'collections.confirm' => ['Confirm/Cancel Collections', 'Accounts Receivable'],

        // Accounts Payable
        'ap.view' => ['View Accounts Payable', 'Accounts Payable'],
        'ap.manage' => ['Manage Accounts Payable', 'Accounts Payable'],
        'ap.approve' => ['Approve Accounts Payable', 'Accounts Payable'],

        // Budget Management — Disbursements and Budgets are now SEPARATE
        // permission sets (split back out — see class docblock). Routes
        // for both don't exist yet; seeded ahead of time so it's ready
        // once built.
        'disbursements.view' => ['View Disbursements', 'Budget Management'],
        'disbursements.manage' => ['Manage Disbursements', 'Budget Management'],
        'disbursements.approve' => ['Approve Disbursements', 'Budget Management'],
        'disbursements.release' => ['Release Disbursements', 'Budget Management'],
        'budgets.view' => ['View Budgets', 'Budget Management'],
        'budgets.manage' => ['Manage Budgets', 'Budget Management'],
        'budgets.approve' => ['Approve Budgets', 'Budget Management'],

        // Accounting
        'expenses.view' => ['View Expenses', 'Accounting'],
        'expenses.manage' => ['Manage Expenses', 'Accounting'],
        'expenses.approve' => ['Approve Expenses', 'Accounting'],
        'general-ledger.view' => ['View General Ledger', 'Accounting'],
        'tax.view' => ['View Tax Obligations', 'Accounting'],
        'tax.manage' => ['Manage Tax Obligations', 'Accounting'],

        // Forecasting
        'forecasting.view' => ['View Financial Forecasting', 'Forecasting'],
        'forecasting.manage' => ['Manage Financial Forecasting', 'Forecasting'],
        'ai.view' => ['View AI Decision Support', 'Forecasting'],

        // Reports
        'reports.view' => ['View Reports', 'Reports'],
    ];

    /** Both admin-tier slugs — kept as a list so it's one place to edit
     *  if you ever want them to diverge again. */
    protected array $fullAccessRoles = ['super-admin', 'admin'];

    protected array $roleAccess = [
        'staff' => [
            'settings.view', // sidebar logo/name — see class docblock
            'dashboard.view',
            'customers.view', 'customers.manage',
            'suppliers.view', 'suppliers.manage',
            'collectors.view', 'collectors.manage', // staff can manage collector accounts
            'ar.view', 'ar.manage',
            'ap.view', 'ap.manage', // NOT ap.approve
            'expenses.view', 'expenses.manage', // NOT expenses.approve
            'disbursements.view', 'disbursements.manage', 'disbursements.release', // NOT disbursements.approve
            'budgets.view', 'budgets.manage', // NOT budgets.approve — final approval is Admin/CEO-only
            'expense-categories.view', // read-only dropdown source
            // read-only dropdown sources — the Department and Cash Account
            // selects on the Expense/Disbursement/Budget Add/Edit forms are
            // populated from /api/departments and /api/cash-accounts. Staff
            // NEEDS these view permissions or the dropdowns come back empty
            // (403 → no options) while admin/collector still see them. NOT
            // the .manage twins — keeping read-only on purpose.
            'departments.view',
            'cash-accounts.view',
            // Accounting / reporting — view-only access for staff.
            'general-ledger.view',
            'tax.view',
            'reports.view',
        ],
        'collector' => [
            'settings.view', // sidebar logo/name — see class docblock
            'dashboard.view',
            'customers.view',
            'collectors.view', // can see the Collectors list (read-only)
            'ar.view',
            'collections.view', 'collections.manage', // NOT collections.confirm
        ],
    ];

    public function run(): void
    {
        $roles = [
            'super-admin' => ['display_name' => 'Super Admin', 'description' => 'Full system access.'],
            'admin' => ['display_name' => 'Admin', 'description' => 'Full system access.'],
            'staff' => ['display_name' => 'Staff', 'description' => 'Day-to-day data entry; no approval authority.'],
            'collector' => ['display_name' => 'Collector', 'description' => 'Field collections; no approval authority.'],
        ];

        $roleModels = [];
        foreach ($roles as $name => $attrs) {
            $roleModels[$name] = Role::updateOrCreate(
                ['name' => $name],
                array_merge($attrs, ['is_active' => true])
            );
        }

        $permissionModels = []; // permission_name => Permission
        foreach ($this->permissions as $permissionName => [$label, $dbModule]) {
            $permissionModels[$permissionName] = $this->upsertPermission($permissionName, $label, $dbModule);
        }

        // PRUNE — remove anything left over from prior naming conventions
        // that isn't in the canonical list above (pivot rows first).
        $staleIds = Permission::whereNotIn('permission_name', array_keys($this->permissions))
            ->pluck('id');

        if ($staleIds->isNotEmpty()) {
            DB::table('role_permissions')->whereIn('permission_id', $staleIds)->delete();
            // forceDelete, not delete() — Permission uses SoftDeletes, so a
            // plain delete() here would leave the row soft-deleted while
            // the unique index on permission_name still blocks re-creating
            // a permission with that name later.
            Permission::withTrashed()->whereIn('id', $staleIds)->forceDelete();
            $this->command->info("Pruned {$staleIds->count()} stale permission(s) left over from prior naming conventions.");
        }

        $allPermissionIds = array_map(fn ($p) => $p->id, $permissionModels);

        // super-admin AND admin: everything, no exceptions.
        foreach ($this->fullAccessRoles as $slug) {
            $roleModels[$slug]->permissions()->sync($allPermissionIds);
        }

        // staff, collector: explicit restricted lists — ALWAYS sync on every
        // boot. The seeder is the single source of truth for these roles;
        // any manual changes via the Roles UI will be reset on redeploy.
        // User accounts and role assignments are NOT affected.
        foreach (['staff', 'collector'] as $roleName) {
            $permissionIds = array_map(
                fn ($name) => $permissionModels[$name]->id,
                $this->roleAccess[$roleName]
            );
            $roleModels[$roleName]->permissions()->sync($permissionIds);
            $this->command->info("Synced permissions for '{$roleName}' role.");
        }


        $this->command->info('Roles and permissions seeded (single source of truth).');
    }

    /**
     * updateOrCreate() alone silently misses soft-deleted rows (Eloquent
     * excludes them from the default query), while the unique index on
     * permission_name still blocks a fresh insert — producing a
     * duplicate-key error. withTrashed() finds the row either way;
     * restore() clears deleted_at if it was set.
     */
    protected function upsertPermission(string $permissionName, string $label, string $dbModule): Permission
    {
        $permission = Permission::withTrashed()->firstOrNew(['permission_name' => $permissionName]);

        $permission->fill([
            'display_name' => $label,
            'module' => $dbModule,
            'description' => $label . '.',
            'is_active' => true,
        ]);

        if ($permission->trashed()) {
            $permission->restore();
        } else {
            $permission->save();
        }

        return $permission;
    }
}