<?php

namespace Database\Seeders;

use App\Models\CashAccount;
use App\Models\Department;
use App\Models\User;
use App\Services\DisbursementService;
use Illuminate\Database\Seeder;
use Illuminate\Validation\ValidationException;

/**
 * Demo/defense data for the payroll → Disbursements flow. There is no real
 * Payroll module/service yet (see DisbursementService::createPayrollRequest()'s
 * own comment: "Not yet wired to a route" — this integration is still
 * pending the Payroll team's real schema). Until then, this seeder plays
 * the part of that future module by calling createPayrollRequest()
 * directly, the same way the real integration eventually will — so the
 * demo goes through the same validation and audit logging real payroll
 * requests would, rather than being fake rows that happen to look right.
 *
 * PREREQUISITES: at least one row must already exist in departments,
 * cash_accounts, and users — this seeder looks those up rather than
 * hardcoding ids (this project's cash_accounts schema isn't confirmed,
 * so guessing an id here risked the same wrong-field-name problem already
 * hit earlier with the AP/cash-account dropdowns). Run your
 * Department/CashAccount/User seeders first.
 */
class DisbursementPayrollDemoSeeder extends Seeder
{
    public function run(): void
    {
        $department = Department::first();
        $cashAccount = CashAccount::first();
        $requester = User::first();

        if (! $department || ! $cashAccount || ! $requester) {
            $this->command?->warn(
                'DisbursementPayrollDemoSeeder skipped: needs at least one '
                .'Department, CashAccount, and User to already exist. Seed '
                .'those first, then re-run this seeder.'
            );

            return;
        }

        $service = app(DisbursementService::class);

        // 1) A freshly submitted payroll request, still Pending — this is
        //    the scenario you specifically want to demo: "another
        //    department requested payroll, it needs Finance's approval."
        $pending = $service->createPayrollRequest([
            'department_id' => $department->id,
            'cash_account_id' => $cashAccount->id,
            'payee' => "{$department->department_name} Payroll — Batch 1",
            'payroll_batch_number' => 'PR-'.now()->format('Ym').'-001',
            'pay_period_start' => now()->startOfMonth()->toDateString(),
            'pay_period_end' => now()->startOfMonth()->addDays(14)->toDateString(),
            // FIX: payment_date is NOT NULL on disbursements — was missing
            // entirely, causing the insert to fail. Using the pay period's
            // end date as the intended payout date, matching how payroll
            // is normally disbursed right after a cutoff.
            'payment_date' => now()->startOfMonth()->addDays(14)->toDateString(),
            'employee_count' => 12,
            'amount_paid' => 186000.00,
            'currency' => 'PHP',
            'payment_method' => 'Bank Transfer',
            'reference_number' => null,
            'remarks' => 'Semi-monthly payroll — first cutoff.',
        ], $requester->id);

        $this->command?->info("Seeded Pending payroll request {$pending->voucher_number}.");

        // 2) A second batch, already Approved — shows the "awaiting
        //    release" stage without needing to click through the UI.
        $approved = $service->createPayrollRequest([
            'department_id' => $department->id,
            'cash_account_id' => $cashAccount->id,
            'payee' => "{$department->department_name} Payroll — Batch 2",
            'payroll_batch_number' => 'PR-'.now()->format('Ym').'-002',
            'pay_period_start' => now()->startOfMonth()->addDays(15)->toDateString(),
            'pay_period_end' => now()->endOfMonth()->toDateString(),
            'payment_date' => now()->endOfMonth()->toDateString(),
            'employee_count' => 12,
            'amount_paid' => 186000.00,
            'currency' => 'PHP',
            'payment_method' => 'Bank Transfer',
            'reference_number' => null,
            'remarks' => 'Semi-monthly payroll — second cutoff.',
        ], $requester->id);

        $approved = $service->approve($approved, $requester->id);
        $this->command?->info("Seeded Approved payroll request {$approved->voucher_number}.");

        // 3) A third batch, fully Released — shows the complete lifecycle.
        //    release() posts a real journal entry and needs
        //    config('accounting.accounts.payroll_disbursement_control')
        //    and config('accounting.accounts.cash_account_map') populated
        //    (see DisbursementService::releasePayroll()'s own comment) —
        //    if that config isn't set up yet, this step is skipped with a
        //    warning rather than failing the whole seeder.
        $released = $service->createPayrollRequest([
            'department_id' => $department->id,
            'cash_account_id' => $cashAccount->id,
            'payee' => "{$department->department_name} Payroll — Batch 0 (prior month)",
            'payroll_batch_number' => 'PR-'.now()->subMonth()->format('Ym').'-002',
            'pay_period_start' => now()->subMonth()->startOfMonth()->addDays(15)->toDateString(),
            'pay_period_end' => now()->subMonth()->endOfMonth()->toDateString(),
            'payment_date' => now()->subMonth()->endOfMonth()->toDateString(),
            'employee_count' => 11,
            'amount_paid' => 170500.00,
            'currency' => 'PHP',
            'payment_method' => 'Bank Transfer',
            'reference_number' => null,
            'remarks' => 'Semi-monthly payroll — prior month, for demo history.',
        ], $requester->id);

        $released = $service->approve($released, $requester->id);

        try {
            $released = $service->release($released, $requester->id);
            $this->command?->info("Seeded Released payroll request {$released->voucher_number}.");
        } catch (ValidationException $e) {
            $this->command?->warn(
                'Could not release the demo payroll disbursement (left as Approved instead): '
                .collect($e->errors())->flatten()->first()
            );
        }
    }
}