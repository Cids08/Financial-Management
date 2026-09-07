<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    /**
     * Delegates to the canonical RolesAndPermissionsSeeder.
     */
    public function run(): void
    {
        $this->call(RolesAndPermissionsSeeder::class);
    }
}