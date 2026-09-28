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
                'bank_name' => 'BDO Unibank', 'branch_name' => 'Ortigas Center Branch', 'account_number' => '001-234-567890',
                'account_type' => 'Checking', 'currency' => 'PHP', 'opening_balance' => 2500000.00, 'current_balance' => 2500000.00,
                'is_default' => true, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1011', 'account_name' => 'BPI Payroll Account',
                'bank_name' => 'Bank of the Philippine Islands', 'branch_name' => 'Ayala Avenue Main', 'account_number' => '002-345-678901',
                'account_type' => 'Checking', 'currency' => 'PHP', 'opening_balance' => 1200000.00, 'current_balance' => 1200000.00,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1012', 'account_name' => 'Metrobank Reserve Fund',
                'bank_name' => 'Metropolitan Bank & Trust Co.', 'branch_name' => 'Makati Avenue Branch', 'account_number' => '003-456-789012',
                'account_type' => 'Savings', 'currency' => 'PHP', 'opening_balance' => 5000000.00, 'current_balance' => 5000000.00,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1013', 'account_name' => 'Security Bank CapEx Account',
                'bank_name' => 'Security Bank Corporation', 'branch_name' => 'Bonifacio Global City', 'account_number' => '004-567-890123',
                'account_type' => 'Checking', 'currency' => 'PHP', 'opening_balance' => 3500000.00, 'current_balance' => 3500000.00,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1014', 'account_name' => 'UnionBank Digital Gateway',
                'bank_name' => 'Union Bank of the Philippines', 'branch_name' => 'Pasig Meralco Branch', 'account_number' => '005-678-901234',
                'account_type' => 'Checking', 'currency' => 'PHP', 'opening_balance' => 1800000.00, 'current_balance' => 1800000.00,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1015', 'account_name' => 'RCBC Heavy Fleet Escrow',
                'bank_name' => 'Rizal Commercial Banking Corp.', 'branch_name' => 'Buendia Main', 'account_number' => '006-789-012345',
                'account_type' => 'Savings', 'currency' => 'PHP', 'opening_balance' => 4200000.00, 'current_balance' => 4200000.00,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1016', 'account_name' => 'Landbank Statutory Remittance',
                'bank_name' => 'Land Bank of the Philippines', 'branch_name' => 'BOC Port Area Branch', 'account_number' => '007-890-123456',
                'account_type' => 'Checking', 'currency' => 'PHP', 'opening_balance' => 950000.00, 'current_balance' => 950000.00,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1017', 'account_name' => 'PNB Regional Field Fund',
                'bank_name' => 'Philippine National Bank', 'branch_name' => 'Clark Freeport Branch', 'account_number' => '008-901-234567',
                'account_type' => 'Checking', 'currency' => 'PHP', 'opening_balance' => 750000.00, 'current_balance' => 750000.00,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1018', 'account_name' => 'Central Equipment Yard Petty Cash',
                'bank_name' => 'Internal Vault', 'branch_name' => 'Central Yard 1', 'account_number' => 'PC-YARD-001',
                'account_type' => 'Petty Cash', 'currency' => 'PHP', 'opening_balance' => 100000.00, 'current_balance' => 100000.00,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1019', 'account_name' => 'Manila Depot Fuel Petty Cash',
                'bank_name' => 'Internal Vault', 'branch_name' => 'Logistics Depot Manila', 'account_number' => 'PC-DEPOT-002',
                'account_type' => 'Petty Cash', 'currency' => 'PHP', 'opening_balance' => 80000.00, 'current_balance' => 80000.00,
                'is_default' => false, 'status' => 'Active',
            ],
            [
                'account_code' => 'CA-1020', 'account_name' => 'Subic Quarry Emergency Petty Cash',
                'bank_name' => 'Internal Vault', 'branch_name' => 'Subic Site Office', 'account_number' => 'PC-SUBIC-003',
                'account_type' => 'Petty Cash', 'currency' => 'PHP', 'opening_balance' => 75000.00, 'current_balance' => 75000.00,
                'is_default' => false, 'status' => 'Active',
            ],
        ];

        foreach ($accounts as $account) {
            CashAccount::updateOrCreate(['account_code' => $account['account_code']], $account);
        }
    }
}