<?php

namespace Database\Seeders;

use App\Models\AccountsPayable;
use App\Models\ChartOfAccount;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seeds sample Accounts Payable vendor bills across 6 months (April - September 2026).
 * Uses all 12 suppliers to ensure comprehensive master and transactional coverage for defense.
 */
class AccountsPayableSeeder extends Seeder
{
    public function run(): void
    {
        $suppliers = Supplier::all();
        $users = User::all();
        $expenseAccount = ChartOfAccount::query()->where('account_type', 'Expense')->first()
            ?? ChartOfAccount::query()->first();

        if ($suppliers->isEmpty()) {
            $this->command?->warn('No suppliers found — skipping AccountsPayableSeeder. Seed suppliers first.');
            return;
        }

        if ($users->isEmpty()) {
            $this->command?->warn('No users found — skipping AccountsPayableSeeder. Seed users first.');
            return;
        }

        $supplier = fn (int $i) => $suppliers[$i % $suppliers->count()];
        $user = fn (int $i) => $users[$i % $users->count()];

        $rows = [
            // Month 1: April 2026
            [
                'invoice_number' => 'BILL-2026-0401',
                'invoice_date' => '2026-04-03',
                'due_date' => '2026-05-03',
                'original_amount' => 310000.00,
                'paid_amount' => 310000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0401',
                'reference_number' => 'REF-AP-0401',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Petron Fleet 10,000L diesel fuel supply for central depot and site excavators - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0402',
                'invoice_date' => '2026-04-10',
                'due_date' => '2026-05-10',
                'original_amount' => 145000.00,
                'paid_amount' => 145000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0402',
                'reference_number' => 'REF-AP-0402',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Monark CAT 320D 1000-hour preventive maintenance parts and filter kits - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0403',
                'invoice_date' => '2026-04-18',
                'due_date' => '2026-05-18',
                'original_amount' => 220000.00,
                'paid_amount' => 220000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0403',
                'reference_number' => 'REF-AP-0403',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Holcim Portland cement bulk delivery for yard foundation batching - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0404',
                'invoice_date' => '2026-04-25',
                'due_date' => '2026-05-25',
                'original_amount' => 85000.00,
                'paid_amount' => 85000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0404',
                'reference_number' => 'REF-AP-0404',
                'status' => 'Paid',
                'has_attachment' => false,
                'remarks' => 'Bridgestone heavy crane and lowbed trailer replacement radial tires - Settled',
                'is_approved' => true,
            ],

            // Month 2: May 2026
            [
                'invoice_number' => 'BILL-2026-0501',
                'invoice_date' => '2026-05-02',
                'due_date' => '2026-06-02',
                'original_amount' => 335000.00,
                'paid_amount' => 335000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0501',
                'reference_number' => 'REF-AP-0501',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Shell Rimula heavy diesel engine oil and bulk fuel delivery - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0502',
                'invoice_date' => '2026-05-11',
                'due_date' => '2026-06-11',
                'original_amount' => 180000.00,
                'paid_amount' => 180000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0502',
                'reference_number' => 'REF-AP-0502',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'SteelAsia structural crane boom reinforcing steel & bracing bars - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0503',
                'invoice_date' => '2026-05-19',
                'due_date' => '2026-06-19',
                'original_amount' => 160000.00,
                'paid_amount' => 160000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0503',
                'reference_number' => 'REF-AP-0503',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Komatsu Philippines hydraulic hose and cylinder seal replacements - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0504',
                'invoice_date' => '2026-05-26',
                'due_date' => '2026-06-26',
                'original_amount' => 92000.00,
                'paid_amount' => 92000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0504',
                'reference_number' => 'REF-AP-0504',
                'status' => 'Paid',
                'has_attachment' => false,
                'remarks' => 'Pioneer Insurance comprehensive equipment policy for Tadano crane - Settled',
                'is_approved' => true,
            ],

            // Month 3: June 2026
            [
                'invoice_number' => 'BILL-2026-0601',
                'invoice_date' => '2026-06-05',
                'due_date' => '2026-07-05',
                'original_amount' => 320000.00,
                'paid_amount' => 320000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0601',
                'reference_number' => 'REF-AP-0601',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Petron Fleet heavy diesel fuel bunkering for June project operations - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0602',
                'invoice_date' => '2026-06-12',
                'due_date' => '2026-07-12',
                'original_amount' => 195000.00,
                'paid_amount' => 100000.00,
                'remaining_balance' => 95000.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0602',
                'reference_number' => 'REF-AP-0602',
                'status' => 'Partially Paid',
                'has_attachment' => true,
                'remarks' => 'Goodyear Philippines 10-wheeler tractor steer and drive tires - Downpayment settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0603',
                'invoice_date' => '2026-06-20',
                'due_date' => '2026-07-20',
                'original_amount' => 140000.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 140000.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0603',
                'reference_number' => 'REF-AP-0603',
                'status' => 'Overdue',
                'has_attachment' => true,
                'remarks' => 'Safety 1st PPE supplier fall protection harnesses and crane rigger helmets - Overdue',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0604',
                'invoice_date' => '2026-06-28',
                'due_date' => '2026-07-28',
                'original_amount' => 78000.00,
                'paid_amount' => 78000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0604',
                'reference_number' => 'REF-AP-0604',
                'status' => 'Paid',
                'has_attachment' => false,
                'remarks' => 'FastCat RORO ferry booking for mobile crane crossing to Batangas - Settled',
                'is_approved' => true,
            ],

            // Month 4: July 2026
            [
                'invoice_number' => 'BILL-2026-0701',
                'invoice_date' => '2026-07-04',
                'due_date' => '2026-08-04',
                'original_amount' => 360000.00,
                'paid_amount' => 360000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0701',
                'reference_number' => 'REF-AP-0701',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Shell Philippines bulk diesel for July operations across North sites - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0702',
                'invoice_date' => '2026-07-14',
                'due_date' => '2026-08-14',
                'original_amount' => 210000.00,
                'paid_amount' => 210000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0702',
                'reference_number' => 'REF-AP-0702',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Monark CAT overhaul kit for hydraulic excavator engine components - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0703',
                'invoice_date' => '2026-07-22',
                'due_date' => '2026-08-22',
                'original_amount' => 165000.00,
                'paid_amount' => 80000.00,
                'remaining_balance' => 85000.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0703',
                'reference_number' => 'REF-AP-0703',
                'status' => 'Partially Paid',
                'has_attachment' => true,
                'remarks' => 'Bridgestone specialty off-road crane tires - Milestone payment',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0704',
                'invoice_date' => '2026-07-29',
                'due_date' => '2026-08-29',
                'original_amount' => 110000.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 110000.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0704',
                'reference_number' => 'REF-AP-0704',
                'status' => 'Overdue',
                'has_attachment' => true,
                'remarks' => 'Pioneer Insurance commercial logistics fleet policy second premium - Overdue',
                'is_approved' => true,
            ],

            // Month 5: August 2026
            [
                'invoice_number' => 'BILL-2026-0801',
                'invoice_date' => '2026-08-02',
                'due_date' => '2026-09-02',
                'original_amount' => 380000.00,
                'paid_amount' => 380000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0801',
                'reference_number' => 'REF-AP-0801',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Petron Fleet bulk fuel supply for August peak operations - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0802',
                'invoice_date' => '2026-08-09',
                'due_date' => '2026-09-09',
                'original_amount' => 175000.00,
                'paid_amount' => 175000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0802',
                'reference_number' => 'REF-AP-0802',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'SteelAsia custom crane counterweight retention frame fabrications - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0803',
                'invoice_date' => '2026-08-16',
                'due_date' => '2026-09-16',
                'original_amount' => 190000.00,
                'paid_amount' => 95000.00,
                'remaining_balance' => 95000.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0803',
                'reference_number' => 'REF-AP-0803',
                'status' => 'Partially Paid',
                'has_attachment' => true,
                'remarks' => 'Komatsu spare parts kit for WA380 wheel loader steering gear - Partial settlement',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0804',
                'invoice_date' => '2026-08-25',
                'due_date' => '2026-09-25',
                'original_amount' => 125000.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 125000.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0804',
                'reference_number' => 'REF-AP-0804',
                'status' => 'Pending',
                'has_attachment' => false,
                'remarks' => 'Safety 1st PPE fall protection systems and crane wireless anemometers - Pending approval',
                'is_approved' => false,
            ],

            // Month 6: September 2026
            [
                'invoice_number' => 'BILL-2026-0901',
                'invoice_date' => '2026-09-03',
                'due_date' => '2026-10-03',
                'original_amount' => 395000.00,
                'paid_amount' => 395000.00,
                'remaining_balance' => 0.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0901',
                'reference_number' => 'REF-AP-0901',
                'status' => 'Paid',
                'has_attachment' => true,
                'remarks' => 'Shell Bulk heavy diesel fuel for September Manila and Subic operations - Settled',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0902',
                'invoice_date' => '2026-09-10',
                'due_date' => '2026-10-10',
                'original_amount' => 230000.00,
                'paid_amount' => 115000.00,
                'remaining_balance' => 115000.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0902',
                'reference_number' => 'REF-AP-0902',
                'status' => 'Partially Paid',
                'has_attachment' => true,
                'remarks' => 'Monark CAT 320D undercarriage roller assembly & track links - Downpayment paid',
                'is_approved' => true,
            ],
            [
                'invoice_number' => 'BILL-2026-0903',
                'invoice_date' => '2026-09-18',
                'due_date' => '2026-10-18',
                'original_amount' => 150000.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 150000.00,
                'payment_method' => 'Check',
                'purchase_order_no' => 'PO-AP-2026-0903',
                'reference_number' => 'REF-AP-0903',
                'status' => 'Pending',
                'has_attachment' => true,
                'remarks' => 'Holcim specialized non-shrink grouting mortar for crane foundation plates - Awaiting review',
                'is_approved' => false,
            ],
            [
                'invoice_number' => 'BILL-2026-0904',
                'invoice_date' => '2026-09-24',
                'due_date' => '2026-10-24',
                'original_amount' => 88000.00,
                'paid_amount' => 0.00,
                'remaining_balance' => 88000.00,
                'payment_method' => 'Bank Transfer',
                'purchase_order_no' => 'PO-AP-2026-0904',
                'reference_number' => 'REF-AP-0904',
                'status' => 'Pending',
                'has_attachment' => false,
                'remarks' => 'Goodyear Philippines steer tire batch for lowbed tractor unit - Fresh billing',
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

        $this->command?->info('Seeded ' . count($rows) . ' accounts payable records across 6 months.');
    }
}
