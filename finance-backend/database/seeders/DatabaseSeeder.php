<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            SuperAdminSeeder::class,
            DepartmentSeeder::class,
            PermissionSeeder::class,
            // ...other seeders (RoleSeeder, DepartmentSeeder, etc.) go here
        ]);
    }
}