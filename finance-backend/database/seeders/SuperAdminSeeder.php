<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class SuperAdminSeeder extends Seeder
{
    /**
     * Bootstraps the Super Admin role and account.
     *
     * Credentials come from .env (never hardcoded) so this can run safely
     * in any environment without leaking a known password. If the env vars
     * aren't set, a random password is generated and printed once to the
     * console — it will NOT be recoverable afterwards.
     */
    public function run(): void
    {
        $role = Role::firstOrCreate(
            ['name' => 'super-admin'],
            [
                'display_name' => 'Super Admin',
                'description'  => 'Full system access. Bypasses standard permission checks.',
                'is_active'    => true,
            ]
        );

// Guard: if any user already holds the super-admin role, the
        // account was already seeded (or manually promoted). Never
        // overwrite it — the user may have changed their email or
        // password, and we must not revert their credentials on boot.
        if (User::where('role_id', $role->id)->exists()) {
            $this->command->warn('Super Admin account already exists (by role) — skipping.');
            return;
        }

        $email     = env('SUPER_ADMIN_EMAIL', 'superadmin@alibaton.test');
        $password  = env('SUPER_ADMIN_PASSWORD') ?: Str::password(16);

        User::create([
            'role_id'           => $role->id,
            'employee_no'       => 'SA-0001',
            'first_name'        => 'Super',
            'last_name'         => 'Admin',
            'email'             => $email,
            'password'          => Hash::make($password),
            'status'            => 'Active',
            'email_verified_at' => now(),
        ]);

        $this->command->info('Super Admin account created.');
        $this->command->info("Email: {$email}");

        if (! env('SUPER_ADMIN_PASSWORD')) {
            $this->command->warn("Password (save this now, it won't be shown again): {$password}");
        }

        $this->command->warn('Log in and change this password immediately.');
    }
}