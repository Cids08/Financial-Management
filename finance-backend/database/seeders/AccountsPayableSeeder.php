<?php

namespace Database\Seeders;

use App\Models\AccountsPayable;
use App\Models\ChartOfAccount;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seeds sample Accounts Payable bills.
 *
 * Requires at least one row in `suppliers`, `users`, and `chart_of_accounts`
 * already — looks up existing records to preserve valid foreign keys.
 */
class AccountsPayableSeeder extends Seeder
{
    public function run(): void
    {
        $suppliers = Supplier::query()->limit(5)->get();
        $users = User::query()->limit(3)->get();
        $expenseAccount = ChartOfAccount::query()->where('account_type', 'Expense')->first()
            ?? ChartOfAccount::query()->first();

        if ($suppliers->isEmpty()) {
            $this->command->warn('No suppliers found — skipping AccountsPayableSeeder. Seed suppliers first.');
            return;
        }

        if ($users->isEmpty()) {
            $this->command->warn('No users found — skipping AccountsPayableSeeder. Seed users first.');
            return;
        }

        $supplier = fn (int $i) => $suppliers[$i % $suppliers->count()];
        $user = fn (int $i) => $users[$i % $users->count()];

        $rows = [
            [
                'invoice_number' => 'BILL-2026-0001',
                'invoice_date' => '2026-06-10',
                'due_date' => '2026-07-10',
                'original_amount' => 148500.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 148500.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-001',
                'reference_number' => 'REF-AP-0001',
                'status' => 'Overdue',
                'has_attachment' => true,
                'remarks' => 'Bulk structural steel supply for North Tower construction.',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0002',
                'invoice_date' => '2026-07-02',
                'due_date' => '2026-08-02',
                'original_amount' => 75000.00,
                'paid_amount' => 35000.00,
                'remaining_balance' => 40000.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-002',
                'reference_number' => 'REF-AP-0002',
                'status' => 'Partially Paid',
                'has_attachment' => true,
                'remarks' => 'Heavy equipment freight and logistics delivery.',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0003',
                'invoice_date' => '2026-08-05',
                'due_date' => '2026-09-05',
                'original_amount' => 52800.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 52800.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-003',
                'reference_number' => 'REF-AP-0003',
                'status' => 'Pending',
                'has_attachment' => true,
                'remarks' => 'Quarterly site safety consumables and protective equipment.',
                'is_approved' => false,
            ],
            [
                'invoice_number' => 'BILL-2026-0004',
                'invoice_date' => '2026-05-18',
                'due_date' => '2026-06-18',
                'original_amount' => 220000.00,
                'paid_amount' => 220000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-004',
                'reference_number' => 'REF-AP-0004',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Electrical conduit installation components - paid in full.',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0005',
                'invoice_date' => '2026-08-12',
                'due_date' => '2026-09-12',
                'original_amount' => 94200.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 94200.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-005',
                'reference_number' => 'REF-AP-0005',
                'status' => 'Pending',
                'has_attachment' => false,
                'remarks' => 'Diesel fuel allocation for site generators and excavators.',
                'is_approved' => false,
            ],
            [
                'invoice_number' => 'BILL-2026-0006',
                'invoice_date' => '2026-07-28',
                'due_date' => '2026-08-28',
                'original_amount' => 63500.00,
                'paid_amount' => 20000.00,
                'remaining_balance' => 43500.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-006',
                'reference_number' => 'REF-AP-0006',
                'status' => 'Partially Paid',
                'has_attachment' => true,
                'remarks' => 'Plumbing fixtures & commercial valves downpayment.',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0007',
                'invoice_date' => '2026-06-15',
                'due_date' => '2026-07-15',
                'original_amount' => 115000.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 115000.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-007',
                'reference_number' => 'REF-AP-0007',
                'status' => 'Overdue',
                'has_attachment' => true,
                'remarks' => 'Scaffolding rental second-quarter billing overdue.',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0008',
                'invoice_date' => '2026-08-20',
                'due_date' => '2026-09-20',
                'original_amount' => 38000.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 38000.00,
                'payment_method' => 'Cash',
                'purchase_order_no' => 'PO-AP-2026-008',
                'reference_number' => 'REF-AP-0008',
                'status' => 'Pending',
                'has_attachment' => false,
                'remarks' => 'Site office blueprint printing & stationery supplies.',
                'is_approved' => false,
            ],
        ];

        foreach ($rows as $i => $row) {
            $sup = $supplier($i);
            $creator = $user($i);
            $approver = $row['is_approved'] ? $users->first() : null;

            AccountsPayable::updateOrCreate(
                ['invoice_number' => $row['invoice_number']],
                [
                    'supplier_id' => $sup->id,
                    'account_id' => $expenseAccount?->id,
                    'invoice_date' => $row['invoice_date'],
                    'due_date' => $row['due_date'],
                    'purchase_order_no' => $row['purchase_order_no'],
                    'billing_address' => $sup->address,
                    'original_amount' => $row['original_amount'],
                    'paid_amount' => $row['paid_amount'],
                    'remaining_balance' => $row['remaining_balance'],
                    'currency' => 'PHP',
                    'payment_method' => $row['payment_method'],
                    'reference_number' => $row['reference_number'],
                    'status' => $row['status'],
                    'approved_by' => $approver?->id,
                    'approved_at' => $row['is_approved'] ? now()->subDays(rand(5, 30)) : null,
                    'has_attachment' => $row['has_attachment'],
                    'remarks' => $row['remarks'],
                    'created_by' => $creator->id,
                ]
            );
        }

        $this->command->info('Seeded ' . count($rows) . ' accounts payable records.');
    }
}
