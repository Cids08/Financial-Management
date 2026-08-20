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
 *   staff, collector — get their default permission list (below) ONLY
 *     the run that actually creates the role (tracked via
 *     wasRecentlyCreated). After that, this seeder never touches their
 *     role_permissions again — an admin's changes via Roles.jsx's
 *     "Manage Permissions" modal are left alone on every later run,
 *     instead of being silently reset back to these defaults.
 *
 * settings.view IS granted to staff/collector as part of their default
 * list below (needed for CompanyContext.jsx/Sidebar.jsx to show the
 * company logo/name — that endpoint requires settings.view for everyone).
 * BUT because of the wasRecentlyCreated gate above: if staff/collector
 * already existed in your DB before this file's settings.view addition,
 * running this seeder will NOT retroactively grant it — the gate treats
 * "role already exists" as "don't touch it," full stop. If your
 * staff/collector accounts' sidebars are still missing the company logo
 * after seeding, that's why — grant settings.view to them manually once
 * via Roles.jsx's "Manage Permissions" modal, or truncate their
 * role_permissions rows for those two roles specifically before
 * re-seeding so wasRecentlyCreated-style defaults apply again (NOT a
 * full re-seed of super-admin/admin, which are unaffected by this gate
 * anyway).
 *
 * Same caveat applies to budgets.view/budgets.manage below — added to
 * staff's default list, but only takes effect for a staff role created
 * AFTER this addition. An already-existing staff role needs the same
 * manual grant (or role_permissions truncation) described above.
 *
 * disbursements.* and budgets.* are now SEPARATE permission groups
 * (both under the "Budget Management" DB module, since the CHECK
 * constraint only allows that one module name for this area — but
 * distinct permission_name values, independently assignable). This was
 * previously one combined disbursements.* set covering both; split back
 * out per clarification so Budgets access doesn't imply Disbursements
 * access or vice versa. Routes for both don't exist yet in
 * routes/api.php — seeded ahead of time so it's ready once built.
 *
 * PRUNING: permission_name values not in the canonical list below are
 * deleted (pivot rows first) — this cleans up orphaned rows from prior
 * naming conventions this project went through.
 *
 * Re-run safe: permissions and role records always sync. Role-to-
 * permission ASSIGNMENT is safe to re-run too, but by design does
 * nothing once a role already exists — see "Role access" above.
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
            'ar.view', 'ar.manage',
            'ap.view', 'ap.manage', // NOT ap.approve
            'expenses.view', 'expenses.manage', // NOT expenses.approve
            'disbursements.view', 'disbursements.manage', // NOT disbursements.approve
            'budgets.view', 'budgets.manage', // NOT budgets.approve — final approval is Admin/CEO-only
            'expense-categories.view', // read-only dropdown source
        ],
        'collector' => [
            'settings.view', // sidebar logo/name — see class docblock
            'dashboard.view',
            'customers.view',
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
        $roleWasCreated = []; // name => bool, from wasRecentlyCreated
        foreach ($roles as $name => $attrs) {
            $role = Role::updateOrCreate(
                ['name' => $name],
                array_merge($attrs, ['is_active' => true])
            );
            $roleModels[$name] = $role;
            $roleWasCreated[$name] = $role->wasRecentlyCreated;
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

        // staff, collector: explicit restricted lists — but ONLY on the
        // run that actually creates the role. See class docblock for what
        // to do if these roles already existed before settings.view/
        // budgets.* were added to their default list.
        foreach (['staff', 'collector'] as $roleName) {
            if (! $roleWasCreated[$roleName]) {
                $this->command->info("Skipped default permissions for '{$roleName}' — role already exists, leaving its current permissions as-is.");
                continue;
            }

            $permissionIds = array_map(
                fn ($name) => $permissionModels[$name]->id,
                $this->roleAccess[$roleName]
            );
            $roleModels[$roleName]->permissions()->sync($permissionIds);
            $this->command->info("Assigned default permissions to newly-created role '{$roleName}'.");
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