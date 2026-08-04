<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    /**
     * `permissions.module` has a Postgres CHECK constraint
     * (permissions_module_check) limiting it to exactly these 8 values:
     * Administration, Accounts Receivable, Accounts Payable,
     * Budget Management, Accounting, Forecasting, Reports, System Settings.
     *
     * These are business domains, not page/feature names — Users and Roles
     * management both fall under 'Administration'; company branding /
     * regional & financial defaults fall under 'System Settings'.
     *
     * permission_name itself is a free-text unique slug (no CHECK on it),
     * so it stays granular per feature even though module is coarse.
     */
    public function run(): void
    {
        $entries = [
            ['slug' => 'users.view', 'label' => 'View Users', 'module' => 'Administration', 'desc' => 'Can view the Users section.'],
            ['slug' => 'users.manage', 'label' => 'Manage Users', 'module' => 'Administration', 'desc' => 'Can create, edit, archive, and restore users.'],

            ['slug' => 'roles.view', 'label' => 'View Roles', 'module' => 'Administration', 'desc' => 'Can view the Roles section.'],
            ['slug' => 'roles.manage', 'label' => 'Manage Roles', 'module' => 'Administration', 'desc' => 'Can create, edit, delete roles, and assign permissions.'],

            ['slug' => 'settings.view', 'label' => 'View Settings', 'module' => 'System Settings', 'desc' => 'Can view company branding and financial defaults.'],
            ['slug' => 'settings.manage', 'label' => 'Manage Settings', 'module' => 'System Settings', 'desc' => 'Can update company branding, logo, and financial defaults.'],
        ];

        foreach ($entries as $entry) {
            Permission::firstOrCreate(
                ['permission_name' => $entry['slug']],
                [
                    'display_name' => $entry['label'],
                    'module' => $entry['module'],
                    'description' => $entry['desc'],
                    'is_active' => true,
                ]
            );
        }
    }
}