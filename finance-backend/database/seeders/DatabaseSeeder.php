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
            // CollectorSeeder intentionally omitted:
            //   Collectors are created by linking real user accounts (collector role).
            //   Seeding dummy collectors would bypass that flow.
            ExpenseCategorySeeder::class,
            BudgetSeeder::class,

            // 4. Invoices, Payables & Transactions (Depend on previous entities)
            AccountsReceivableSeeder::class,
            AccountsPayableSeeder::class,
            // CollectionSeeder intentionally omitted: requires collectors to exist.
            ExpenseSeeder::class,
            TaxObligationSeeder::class,
            JournalEntrySeeder::class,
            DisbursementPayrollDemoSeeder::class,
        ]);

    }
}