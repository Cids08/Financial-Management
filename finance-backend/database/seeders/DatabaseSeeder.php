<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            // 1. Core Auth, Roles & Permissions
            RolesAndPermissionsSeeder::class,
            SuperAdminSeeder::class,
            MissingPermissionsSeeder::class,

            // 2. Foundational Organizational Units & Entities
            DepartmentSeeder::class,
            ServiceAreaSeeder::class,
            CustomerSeeder::class,
            SupplierSeeder::class,

            // 3. Accounting Structure & Accounts
            ChartOfAccountSeeder::class,
            CashAccountSeeder::class,
            CollectorSeeder::class,
            ExpenseCategorySeeder::class,
            BudgetSeeder::class,

            // 4. Invoices, Payables & Transactions (Depend on previous entities)
            AccountsReceivableSeeder::class,
            CollectionSeeder::class,
            ExpenseSeeder::class,
            TaxObligationSeeder::class,
            JournalEntrySeeder::class,
            DisbursementPayrollDemoSeeder::class,
        ]);
    }
}