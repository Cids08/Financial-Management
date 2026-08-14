<?php

namespace Database\Seeders;

use App\Models\ChartOfAccount;
use Illuminate\Database\Seeder;

class ChartOfAccountSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = [
            // Assets
            ['account_code' => '1000', 'account_name' => 'Cash on Hand', 'account_type' => 'Asset', 'account_category' => 'Current Asset'],
            ['account_code' => '1010', 'account_name' => 'BDO Operating Account', 'account_type' => 'Asset', 'account_category' => 'Current Asset'],
            ['account_code' => '1011', 'account_name' => 'BPI Payroll Account', 'account_type' => 'Asset', 'account_category' => 'Current Asset'],
            ['account_code' => '1012', 'account_name' => 'Metrobank Reserve Fund', 'account_type' => 'Asset', 'account_category' => 'Current Asset'],
            ['account_code' => '1100', 'account_name' => 'Accounts Receivable', 'account_type' => 'Asset', 'account_category' => 'Current Asset'],
            ['account_code' => '1500', 'account_name' => 'Fixed Assets', 'account_type' => 'Asset', 'account_category' => 'Non-Current Asset'],
            ['account_code' => '1590', 'account_name' => 'Accumulated Depreciation', 'account_type' => 'Asset', 'account_category' => 'Non-Current Asset'],

            // Liabilities
            ['account_code' => '2000', 'account_name' => 'Accounts Payable', 'account_type' => 'Liability', 'account_category' => 'Current Liability'],
            ['account_code' => '2100', 'account_name' => 'Taxes Payable', 'account_type' => 'Liability', 'account_category' => 'Current Liability'],
            ['account_code' => '2200', 'account_name' => 'Accrued Payroll', 'account_type' => 'Liability', 'account_category' => 'Current Liability'],

            // Equity
            ['account_code' => '3000', 'account_name' => "Owner's Capital", 'account_type' => 'Equity', 'account_category' => 'Equity'],
            ['account_code' => '3100', 'account_name' => 'Retained Earnings', 'account_type' => 'Equity', 'account_category' => 'Equity'],

            // Revenue
            ['account_code' => '4000', 'account_name' => 'Sales Revenue', 'account_type' => 'Revenue', 'account_category' => 'Operating Revenue'],
            ['account_code' => '4100', 'account_name' => 'Service Revenue', 'account_type' => 'Revenue', 'account_category' => 'Operating Revenue'],

            // Expenses
            ['account_code' => '5100', 'account_name' => 'Operating Expenses', 'account_type' => 'Expense', 'account_category' => 'Operating Expense'],
            ['account_code' => '5200', 'account_name' => 'Collection Commission Expense', 'account_type' => 'Expense', 'account_category' => 'Operating Expense'],
            ['account_code' => '5300', 'account_name' => 'Tax Expense', 'account_type' => 'Expense', 'account_category' => 'Operating Expense'],
            ['account_code' => '5400', 'account_name' => 'Utilities Expense', 'account_type' => 'Expense', 'account_category' => 'Operating Expense'],
            ['account_code' => '5500', 'account_name' => 'Depreciation Expense', 'account_type' => 'Expense', 'account_category' => 'Operating Expense'],
        ];

        foreach ($accounts as $account) {
            ChartOfAccount::updateOrCreate(
                ['account_code' => $account['account_code']],
                $account + ['is_active' => true]
            );
        }
    }
}