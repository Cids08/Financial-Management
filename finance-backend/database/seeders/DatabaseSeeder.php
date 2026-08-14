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
            RolesAndPermissionsSeeder::class,
            AccountsReceivableSeeder::class,
            JournalEntrySeeder::class,
            ChartOfAccountSeeder::class,
            TaxObligationSeeder::class,
            ExpenseCategorySeeder::class,
            ServiceAreaSeeder::class,
            CollectionSeeder::class,
            CollectorSeeder::class,
            MissingPermissionsSeeder::class,
            ExpenseSeeder::class,
            CashAccountSeeder::class,
            BudgetSeeder::class,
            // ...other seeders (RoleSeeder, DepartmentSeeder, etc.) go here
        ]);
    }
}