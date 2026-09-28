<?php

namespace Database\Seeders;

use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Supplier;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Seeds sample expenses across 6 months (April - September 2026).
 *
 * CRITICAL FOR DEFENSE & ARIMA FORECASTING:
 * PythonArimaForecastEngine explicitly queries:
 *   DB::table('expenses')->where('status', 'Approved')->whereBetween('expense_date', ...)
 *
 * Setting status => 'Approved' for historical months ensures that monthly expense
 * actuals and budget utilization charts are populated with authentic construction &
 * fleet operational data. Late September also includes pending expenses for live approval demos.
 */
class ExpenseSeeder extends Seeder
{
    private const EXPENSE_SOURCES = ['Cash', 'Bank', 'Petty Cash'];

    public function run(): void
    {
        $budgets = Budget::where('status', 'Active')->get();
        if ($budgets->isEmpty()) {
            $budgets = Budget::all();
        }

        $categories = ExpenseCategory::all();
        $suppliers = Supplier::all();
        $cashAccounts = CashAccount::where('status', 'Active')->get();
        $user = User::first();

        $missing = collect([
            'budgets' => $budgets->isEmpty(),
            'expense_categories' => $categories->isEmpty(),
            'cash_accounts' => $cashAccounts->isEmpty(),
            'users' => ! $user,
        ])->filter()->keys();

        if ($missing->isNotEmpty()) {
            throw new RuntimeException(
                'ExpenseSeeder needs existing rows in: ' . $missing->implode(', ') . '. Seed those first.'
            );
        }

        $budgetCount = $budgets->count();
        $catCount = $categories->count();
        $supCount = $suppliers->isNotEmpty() ? $suppliers->count() : 1;
        $accCount = $cashAccounts->count();

        $monthlyTemplates = [
            // Month 1: April 2026
            ['date' => '2026-04-06', 'amount' => 65000.00, 'desc' => 'Site diesel fuel bunkering for north depot cranes', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-04-14', 'amount' => 42500.00, 'desc' => 'Hydraulic line and cylinder seal emergency replacement', 'source' => 'Petty Cash', 'status' => 'Approved'],
            ['date' => '2026-04-21', 'amount' => 88000.00, 'desc' => 'Safety harness gear and crane operator certifications', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-04-28', 'amount' => 54000.00, 'desc' => 'Regional equipment yard utility and water supply', 'source' => 'Cash', 'status' => 'Approved'],

            // Month 2: May 2026
            ['date' => '2026-05-05', 'amount' => 72000.00, 'desc' => 'Bulk synthetic engine oil and lubrication filters restock', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-05-12', 'amount' => 38000.00, 'desc' => 'Field crew travel allowances and mobilization meals', 'source' => 'Petty Cash', 'status' => 'Approved'],
            ['date' => '2026-05-18', 'amount' => 95000.00, 'desc' => 'Mobile crane quarterly calibration and load test certification', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-05-27', 'amount' => 61000.00, 'desc' => 'Subic project staging area security guard service fees', 'source' => 'Bank', 'status' => 'Approved'],

            // Month 3: June 2026
            ['date' => '2026-06-04', 'amount' => 78000.00, 'desc' => 'Jobsite diesel supply for 50-ton Tadano mobile crane', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-06-11', 'amount' => 45000.00, 'desc' => 'Wire rope slings and heavy shackle rigging replacements', 'source' => 'Cash', 'status' => 'Approved'],
            ['date' => '2026-06-19', 'amount' => 84000.00, 'desc' => 'Specialized lowbed escort permits and traffic management', 'source' => 'Petty Cash', 'status' => 'Approved'],
            ['date' => '2026-06-27', 'amount' => 69000.00, 'desc' => 'Head office engineering CAD software license renewal', 'source' => 'Bank', 'status' => 'Approved'],

            // Month 4: July 2026
            ['date' => '2026-07-03', 'amount' => 82000.00, 'desc' => 'Depot bulk fuel delivery for high-tonnage transport fleet', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-07-10', 'amount' => 51000.00, 'desc' => 'Excavator bucket teeth and wear plate hardfacing welding', 'source' => 'Petty Cash', 'status' => 'Approved'],
            ['date' => '2026-07-17', 'amount' => 105000.00, 'desc' => 'Crane engine turbocharger refurbishment and tuning', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-07-26', 'amount' => 73000.00, 'desc' => 'Equipment yard perimeter lighting and electrical repair', 'source' => 'Bank', 'status' => 'Approved'],

            // Month 5: August 2026
            ['date' => '2026-08-04', 'amount' => 89000.00, 'desc' => 'Rainy season equipment rustproofing and waterproofing grease', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-08-12', 'amount' => 46000.00, 'desc' => 'Operator safety PPE boots, vests, and radios', 'source' => 'Petty Cash', 'status' => 'Approved'],
            ['date' => '2026-08-19', 'amount' => 112000.00, 'desc' => 'Emergency generator fuel and battery backup servicing', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-08-27', 'amount' => 77000.00, 'desc' => 'Tollway RFID fleet replenishment for lowbed trucks', 'source' => 'Bank', 'status' => 'Approved'],

            // Month 6: September 2026
            ['date' => '2026-09-03', 'amount' => 85000.00, 'desc' => 'Fleet bulk diesel delivery for September operations', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-09-11', 'amount' => 58000.00, 'desc' => 'Hydraulic filter elements and pressure sensor replacements', 'source' => 'Petty Cash', 'status' => 'Approved'],
            ['date' => '2026-09-18', 'amount' => 96000.00, 'desc' => 'Mobile crane annual safety inspection and load-cell calibration', 'source' => 'Bank', 'status' => 'Approved'],
            ['date' => '2026-09-24', 'amount' => 34000.00, 'desc' => 'Project site office stationery and safety logbook printing', 'source' => 'Cash', 'status' => 'Pending'],
            ['date' => '2026-09-26', 'amount' => 62000.00, 'desc' => 'Tire vulcanizing and alignment for tractor head units', 'source' => 'Petty Cash', 'status' => 'Pending'],
        ];

        foreach ($monthlyTemplates as $i => $tmpl) {
            $budget = $budgets[$i % $budgetCount];
            $category = $categories[$i % $catCount];
            $supplier = $suppliers->isNotEmpty() ? $suppliers[$i % $supCount] : null;
            $cashAccount = $cashAccounts[$i % $accCount];

            $date = Carbon::parse($tmpl['date']);
            $receiptNum = sprintf('EXP-2026-%04d', $i + 1);

            $isApproved = $tmpl['status'] === 'Approved';

            Expense::updateOrCreate(
                ['receipt_number' => $receiptNum],
                [
                    'budget_id' => $budget->id,
                    'expense_category_id' => $category->id,
                    'supplier_id' => $supplier?->id,
                    'cash_account_id' => $cashAccount->id,
                    'expense_date' => $date->toDateString(),
                    'expense_amount' => $tmpl['amount'],
                    'expense_source' => $tmpl['source'],
                    'receipt_status' => $isApproved ? 'Uploaded' : 'Pending',
                    'description' => $tmpl['desc'],
                    'is_over_budget' => false,
                    'status' => $tmpl['status'],
                    'approved_by' => $isApproved ? $user->id : null,
                    'approved_at' => $isApproved ? $date->copy()->setTime(14, 30)->toDateTimeString() : null,
                    'created_by' => $user->id,
                ]
            );
        }

        $this->command?->info('Seeded ' . count($monthlyTemplates) . ' expenses across 6 months (April - September 2026).');
    }
}