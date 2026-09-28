<?php

namespace Database\Seeders;

use App\Models\AccountsPayable;
use App\Models\CashAccount;
use App\Models\Department;
use App\Models\Disbursement;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Seeds released Accounts Payable disbursements across 6 months (April - September 2026).
 *
 * CRITICAL FOR DEFENSE & ARIMA FORECASTING:
 * PythonArimaForecastEngine::monthlyCashFlow() queries:
 *   DB::table('disbursements')->where('status', 'Released')->whereBetween('payment_date', ...)
 *
 * This populates released disbursements for all settled bills in AccountsPayable, ensuring
 * that monthly cash outflows and net cash flows are authentic, mathematically balanced,
 * and span all 6 historical months required for defense review.
 */
class DisbursementSeeder extends Seeder
{
    public function run(): void
    {
        $paidBills = AccountsPayable::with('supplier')
            ->where('paid_amount', '>', 0)
            ->orderBy('invoice_date')
            ->get();

        $cashAccounts = CashAccount::where('status', 'Active')->get();
        $departments = Department::all();
        $user = User::first();

        $missing = collect([
            'accounts_payable (with paid_amount > 0)' => $paidBills->isEmpty(),
            'cash_accounts' => $cashAccounts->isEmpty(),
            'users' => ! $user,
        ])->filter()->keys();

        if ($missing->isNotEmpty()) {
            throw new RuntimeException(
                'DisbursementSeeder needs existing rows in: ' . $missing->implode(', ') . '. Seed those first.'
            );
        }

        $accountCount = $cashAccounts->count();
        $deptCount = $departments->isNotEmpty() ? $departments->count() : 1;

        $disbursements = [];

        foreach ($paidBills as $idx => $bill) {
            $cashAccount = $cashAccounts[$idx % $accountCount];
            $department = $departments->isNotEmpty() ? $departments[$idx % $deptCount] : null;

            // Payment date within 7-25 days after invoice date
            $invDate = Carbon::parse($bill->invoice_date);
            $payDate = $invDate->copy()->addDays(random_int(7, 25));

            if ($payDate->isFuture()) {
                $payDate = Carbon::parse('2026-09-25');
            }

            $dateStr = $payDate->toDateString();
            $voucherNum = sprintf('DV-2026-%04d', $idx + 1);

            $disbursements[] = [
                'ap_id' => $bill->id,
                'source_type' => 'ap',
                'department_id' => $department?->id,
                'cash_account_id' => $cashAccount->id,
                'voucher_number' => $voucherNum,
                'payee' => $bill->supplier?->supplier_name ?? 'Vendor Supplier Inc.',
                'payment_date' => $dateStr,
                'released_date' => $dateStr,
                'amount_paid' => $bill->paid_amount,
                'currency' => 'PHP',
                'payment_method' => $bill->payment_method ?? 'Bank Transfer',
                'reference_number' => sprintf('CHK-%06d', 700000 + $idx),
                'status' => 'Released',
                'approved_by' => $user->id,
                'approved_at' => $payDate->copy()->subDays(2)->toDateTimeString(),
                'released_by' => $user->id,
                'has_attachment' => true,
                'remarks' => "Payment voucher for invoice {$bill->invoice_number} ({$bill->remarks})",
                'created_by' => $user->id,
            ];
        }

        foreach ($disbursements as $d) {
            Disbursement::updateOrCreate(
                ['voucher_number' => $d['voucher_number']],
                $d
            );
        }

        $this->command?->info('Seeded ' . count($disbursements) . ' released disbursements across 6 months.');
    }
}
