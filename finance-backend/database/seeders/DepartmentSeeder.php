<?php

namespace Database\Seeders;

use App\Models\Department;
use Illuminate\Database\Seeder;

class DepartmentSeeder extends Seeder
{
    public function run(): void
    {
        $departments = [
            ['department_name' => 'Finance', 'department_head' => 'Maria Santos', 'department_email' => 'finance@alibaton.com', 'department_phone' => '+63 2 8123 4567', 'description' => 'Handles budgeting, reporting, and financial controls.', 'is_active' => true],
            ['department_name' => 'Operations', 'department_head' => 'Ramon Aguilar', 'department_email' => 'operations@alibaton.com', 'department_phone' => '+63 2 8123 4568', 'description' => 'Manages crane and trucking field operations.', 'is_active' => true],
            ['department_name' => 'Marketing', 'department_head' => 'Ella Navarro', 'department_email' => 'marketing@alibaton.com', 'department_phone' => '+63 2 8123 4569', 'description' => 'Brand, client outreach, and business development.', 'is_active' => true],
            ['department_name' => 'Human Resources', 'department_head' => 'Patricia Reyes', 'department_email' => 'hr@alibaton.com', 'department_phone' => '+63 2 8123 4570', 'description' => 'Employee relations, payroll, and hiring.', 'is_active' => true],
            ['department_name' => 'Legal & Compliance', 'department_head' => 'Victor Manalo', 'department_email' => 'legal@alibaton.com', 'department_phone' => '+63 2 8123 4571', 'description' => 'Contracts, permits, and regulatory compliance.', 'is_active' => false],
        ];

        foreach ($departments as $data) {
            // updateOrCreate instead of create — re-running this seeder
            // (e.g. after `migrate:fresh --seed`, or by accident) now
            // updates the existing 5 rows instead of piling up duplicates
            // every time.
            Department::updateOrCreate(
                ['department_name' => $data['department_name']],
                $data
            );
        }
    }
}