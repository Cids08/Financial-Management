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
            ['account_code' => '1000', 'account_name' => 'Cash on Hand', 'account_type' => 'Asset', 'account_category' => 'Current Asset', 'description' => 'Physical cash kept for day-to-day expenses and small cash transactions (petty cash / EOV float).'],
            ['account_code' => '1010', 'account_name' => 'BDO Operating Account', 'account_type' => 'Asset', 'account_category' => 'Current Asset', 'description' => 'Main operating bank account — deposit collections here and pay disbursements/expenses from it.'],
            ['account_code' => '1011', 'account_name' => 'BPI Payroll Account', 'account_type' => 'Asset', 'account_category' => 'Current Asset', 'description' => 'Payroll-only bank account used for salary runs and employee payouts.'],
            ['account_code' => '1012', 'account_name' => 'Metrobank Reserve Fund', 'account_type' => 'Asset', 'account_category' => 'Current Asset', 'description' => 'Restricted reserve fund set aside (use only for the intended capital/reserve purpose).'],
            ['account_code' => '1100', 'account_name' => 'Accounts Receivable', 'account_type' => 'Asset', 'account_category' => 'Current Asset', 'description' => 'System control account — debited automatically when an invoice is created and credited when a collection is confirmed. Do not post to manually.'],
            ['account_code' => '1500', 'account_name' => 'Fixed Assets', 'account_type' => 'Asset', 'account_category' => 'Non-Current Asset', 'description' => 'Long-term physical assets (equipment, tools, vehicles) carried at cost before depreciation.'],
            ['account_code' => '1590', 'account_name' => 'Accumulated Depreciation', 'account_type' => 'Asset', 'account_category' => 'Non-Current Asset', 'description' => 'Contra-asset (credit balance) accumulating total depreciation booked against fixed assets. Depreciation runs post here automatically.'],

            // Liabilities
            ['account_code' => '2000', 'account_name' => 'Accounts Payable', 'account_type' => 'Liability', 'account_category' => 'Current Liability', 'description' => 'Amounts owed to suppliers for purchases not yet paid. Managed automatically by the AP module.'],
            ['account_code' => '2030', 'account_name' => 'Expanded Withholding Tax Payable', 'account_type' => 'Liability', 'account_category' => 'Current Liability', 'description' => 'Expanded withholding tax (EWT) withheld from suppliers/sellers, to be remitted to the BIR.'],
            ['account_code' => '2100', 'account_name' => 'Taxes Payable', 'account_type' => 'Liability', 'account_category' => 'Current Liability', 'description' => 'Taxes owed to the BIR (income tax, VAT, percentage tax) before remittance.'],
            ['account_code' => '2200', 'account_name' => 'Accrued Payroll', 'account_type' => 'Liability', 'account_category' => 'Current Liability', 'description' => 'Salaries and wages earned by employees but not yet disbursed.'],

            // Equity
            ['account_code' => '3000', 'account_name' => "Owner's Capital", 'account_type' => 'Equity', 'account_category' => 'Equity', 'description' => 'Initial and additional capital contributions made by the owner.'],
            ['account_code' => '3100', 'account_name' => 'Retained Earnings', 'account_type' => 'Equity', 'account_category' => 'Equity', 'description' => 'Accumulated net income from prior periods not yet withdrawn or distributed.'],

            // Revenue
            ['account_code' => '4000', 'account_name' => 'Sales Revenue', 'account_type' => 'Revenue', 'account_category' => 'Operating Revenue', 'description' => 'Revenue from sale of products. Credits post here when product sales are booked.'],
            ['account_code' => '4100', 'account_name' => 'Service Revenue', 'account_type' => 'Revenue', 'account_category' => 'Operating Revenue', 'description' => 'Revenue from services rendered (collections/agency services). Default revenue account for invoices.'],

            // Expenses
            ['account_code' => '5100', 'account_name' => 'Operating Expenses', 'account_type' => 'Expense', 'account_category' => 'Operating Expense', 'description' => 'General day-to-day operating expenses not falling under a specific expense line.'],
            ['account_code' => '5200', 'account_name' => 'Collection Commission Expense', 'account_type' => 'Expense', 'account_category' => 'Operating Expense', 'description' => 'Commissions paid to collectors or agents for successful collections.'],
            ['account_code' => '5300', 'account_name' => 'Tax Expense', 'account_type' => 'Expense', 'account_category' => 'Operating Expense', 'description' => 'Income tax and other taxes recognized as an expense.'],
            ['account_code' => '5400', 'account_name' => 'Utilities Expense', 'account_type' => 'Expense', 'account_category' => 'Operating Expense', 'description' => 'Electric, water, internet and other utility bills.'],
            ['account_code' => '5500', 'account_name' => 'Depreciation Expense', 'account_type' => 'Expense', 'account_category' => 'Operating Expense', 'description' => 'Period depreciation charge for fixed assets. Booked automatically by depreciation runs.'],
        ];

        foreach ($accounts as $account) {
            ChartOfAccount::updateOrCreate(
                ['account_code' => $account['account_code']],
                $account + ['is_active' => true]
            );
        }
    }
}