<?php

namespace Database\Seeders;

use App\Models\CashAccount;
use Illuminate\Database\Seeder;

class CashAccountSeeder extends Seeder
{
    public function run(): void
    {
        // Names/codes deliberately match the accounts already referenced
        // in JournalEntrySeeder's GL entries (BDO, Metrobank), so the
        // General Ledger and Cash Accounts pages tell a consistent story.
        $accounts = [
            [
                'account_code' => 'CA-1010', 'account_name' => 'BDO Operating Account',
                'bank_name' => 'BDO Unibank', 'account_number' => '001-234-567890',
                'account_type' => 'Checking', 'opening_balance' => 500000, 'current_balance' => 500000,
                'is_default' => true, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1011', 'account_name' => 'BPI Payroll Account',
                'bank_name' => 'Bank of the Philippine Islands', 'account_number' => '002-345-678901',
                'account_type' => 'Checking', 'opening_balance' => 200000, 'current_balance' => 200000,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1012', 'account_name' => 'Metrobank Reserve Fund',
                'bank_name' => 'Metropolitan Bank & Trust Co.', 'account_number' => '003-456-789012',
                'account_type' => 'Savings', 'opening_balance' => 1000000, 'current_balance' => 1000000,
                'is_default' => false, 'status' => 'Active',
            ],
        ];

        foreach ($accounts as $account) {
            CashAccount::updateOrCreate(['account_code' => $account['account_code']], $account);
        }
    }
}