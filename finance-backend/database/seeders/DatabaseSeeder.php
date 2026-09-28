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

            // 2. Foundational Organizational Units & Entities (Master Data >= 10 items)
            DepartmentSeeder::class,
            TitleSeeder::class,
            ServiceAreaSeeder::class,
            CustomerSeeder::class,           // 12 corporate clients
            SupplierSeeder::class,           // 12 vendor suppliers
            FixedAssetSeeder::class,         // 12 fixed assets

            // 3. Accounting Structure & Cash Accounts (Master Data >= 10 items)
            ChartOfAccountSeeder::class,
            CashAccountSeeder::class,        // 11 cash accounts (Checking, Savings, Petty Cash)
            CollectorSeeder::class,          // 10 field & corporate collectors
            ExpenseCategorySeeder::class,
            BudgetSeeder::class,             // Annual operational department budgets

            // 4. Invoices, Payables & Financial Transactions (Span 6 months: April - September 2026)
            AccountsReceivableSeeder::class, // 26 invoices across 6 months
            CollectionSeeder::class,         // Confirmed collections across 6 months (critical for ARIMA)
            AccountsPayableSeeder::class,    // 24 bills across 6 months
            DisbursementSeeder::class,       // Released disbursements across 6 months (critical for cash flow ARIMA)
            DisbursementPayrollDemoSeeder::class, // Payroll integration lifecycle batches
            ExpenseSeeder::class,            // Approved expenses across 6 months (critical for expense ARIMA)
            TaxObligationSeeder::class,
            JournalEntrySeeder::class,
        ]);
    }
}