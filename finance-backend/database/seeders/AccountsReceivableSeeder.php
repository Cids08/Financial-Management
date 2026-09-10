<?php

namespace Database\Seeders;

use App\Models\AccountsReceivable;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seeds sample Accounts Receivable invoices.
 *
 * Requires at least one row in `customers` and `users` already — this
 * seeder does NOT create those, it looks up whatever already exists so
 * foreign keys (customer_id, created_by) stay valid. Run your
 * customers/users seeders first if the tables are empty.
 */
class AccountsReceivableSeeder extends Seeder
{
    public function run(): void
    {
        $customers = Customer::query()->limit(5)->get();
        $users = User::query()->limit(3)->get();

        if ($customers->isEmpty()) {
            $this->command->warn('No customers found — skipping AccountsReceivableSeeder. Seed customers first.');
            return;
        }

        if ($users->isEmpty()) {
            $this->command->warn('No users found — skipping AccountsReceivableSeeder. Seed users first.');
            return;
        }

        // Cycle through whatever customers/users exist rather than assuming
        // specific IDs, so this works whether you have 1 or 50 of each.
        $customer = fn (int $i) => $customers[$i % $customers->count()];
        $user = fn (int $i) => $users[$i % $users->count()];

        $rows = [
            [
                'invoice_number' => 'INV-2026-0001',
                'invoice_date' => '2026-06-01',
                'due_date' => '2026-07-01',
                'original_amount' => 125000,
                'balance' => 125000,
                'payment_method' => 'Bank Transfer',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5521',
                'reference_no' => 'REF-AR-001',
                'penalty_rate' => 2,
                'remarks' => '',
                'status' => 'Overdue',
                'is_archived' => false,
            ],
            [
                'invoice_number' => 'INV-2026-0002',
                'invoice_date' => '2026-07-05',
                'due_date' => '2026-08-05',
                'original_amount' => 89000,
                'balance' => 40000,
                'payment_method' => 'Check',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5544',
                'reference_no' => 'REF-AR-002',
                'penalty_rate' => 0,
                'remarks' => 'Partial payment received',
                'status' => 'Partially Paid',
                'is_archived' => false,
            ],
            [
                'invoice_number' => 'INV-2026-0003',
                'invoice_date' => '2026-07-10',
                'due_date' => '2026-08-10',
                'original_amount' => 56000,
                'balance' => 56000,
                'payment_method' => 'Bank Transfer',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5560',
                'reference_no' => 'REF-AR-003',
                'penalty_rate' => 0,
                'remarks' => '',
                'status' => 'Pending',
                'is_archived' => false,
            ],
            [
                'invoice_number' => 'INV-2026-0004',
                'invoice_date' => '2026-05-15',
                'due_date' => '2026-06-15',
                'original_amount' => 210000,
                'balance' => 0,
                'payment_method' => 'Bank Transfer',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5490',
                'reference_no' => 'REF-AR-004',
                'penalty_rate' => 0,
                'remarks' => 'Paid in full',
                'status' => 'Paid',
                'is_archived' => false,
            ],
            [
                'invoice_number' => 'INV-2026-0005',
                'invoice_date' => '2026-04-20',
                'due_date' => '2026-05-20',
                'original_amount' => 34000,
                'balance' => 34000,
                'payment_method' => 'Cash',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5455',
                'reference_no' => 'REF-AR-005',
                'penalty_rate' => 3,
                'remarks' => 'Under review',
                'status' => 'Overdue',
                'is_archived' => true,
            ],
            [
                'invoice_number' => 'INV-2026-0006',
                'invoice_date' => '2026-08-01',
                'due_date' => '2026-09-01',
                'original_amount' => 175000,
                'balance' => 175000,
                'payment_method' => 'Bank Transfer',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5601',
                'reference_no' => 'REF-AR-006',
                'penalty_rate' => 0,
                'remarks' => 'Commercial fit-out phase 1',
                'status' => 'Pending',
                'is_archived' => false,
            ],
            [
                'invoice_number' => 'INV-2026-0007',
                'invoice_date' => '2026-08-15',
                'due_date' => '2026-09-15',
                'original_amount' => 92500,
                'balance' => 46250,
                'payment_method' => 'Check',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5612',
                'reference_no' => 'REF-AR-007',
                'penalty_rate' => 0,
                'remarks' => 'Downpayment settled, 50% remaining on turnover',
                'status' => 'Partially Paid',
                'is_archived' => false,
            ],
            [
                'invoice_number' => 'INV-2026-0008',
                'invoice_date' => '2026-07-20',
                'due_date' => '2026-08-20',
                'original_amount' => 310000,
                'balance' => 0,
                'payment_method' => 'Bank Transfer',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5588',
                'reference_no' => 'REF-AR-008',
                'penalty_rate' => 0,
                'remarks' => 'Structural steel installation completed and paid',
                'status' => 'Paid',
                'is_archived' => false,
            ],
            [
                'invoice_number' => 'INV-2026-0009',
                'invoice_date' => '2026-06-25',
                'due_date' => '2026-07-25',
                'original_amount' => 68000,
                'balance' => 68000,
                'payment_method' => 'Cash',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5535',
                'reference_no' => 'REF-AR-009',
                'penalty_rate' => 2.5,
                'remarks' => 'First demand letter dispatched by collections team',
                'status' => 'Overdue',
                'is_archived' => false,
            ],
            [
                'invoice_number' => 'INV-2026-0010',
                'invoice_date' => '2026-08-28',
                'due_date' => '2026-09-28',
                'original_amount' => 145000,
                'balance' => 145000,
                'payment_method' => 'Bank Transfer',
                'payment_terms' => 'Net 30',
                'purchase_order_no' => 'PO-5640',
                'reference_no' => 'REF-AR-010',
                'penalty_rate' => 0,
                'remarks' => 'Electrical & HVAC rough-ins billing',
                'status' => 'Pending',
                'is_archived' => false,
            ],
        ];

        foreach ($rows as $i => $row) {
            $creator = $user($i);
            $penaltyAmount = $row['penalty_rate'] > 0
                ? round(($row['original_amount'] * $row['penalty_rate']) / 100, 2)
                : 0;

            AccountsReceivable::updateOrCreate(
                ['invoice_number' => $row['invoice_number']],
                [
                    'customer_id' => $customer($i)->id,
                    'invoice_date' => $row['invoice_date'],
                    'due_date' => $row['due_date'],
                    'original_amount' => $row['original_amount'],
                    'paid_amount' => max(0, $row['original_amount'] - $row['balance']),
                    'remaining_balance' => $row['balance'],
                    'payment_method' => $row['payment_method'],
                    'payment_terms' => $row['payment_terms'],
                    'purchase_order_no' => $row['purchase_order_no'],
                    'reference_no' => $row['reference_no'],
                    'penalty_rate' => $row['penalty_rate'],
                    'penalty_amount' => $penaltyAmount,
                    'remarks' => $row['remarks'],
                    'status' => $row['status'],
                    'created_by' => $creator->id,
                    'is_archived' => $row['is_archived'],
                    'archived_at' => $row['is_archived'] ? now() : null,
                    'archived_by' => $row['is_archived'] ? $creator->id : null,
                ]
            );
        }

        $this->command->info('Seeded ' . count($rows) . ' accounts receivable records.');
    }
}