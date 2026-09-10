<?php

namespace Database\Seeders;

use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\Department;
use App\Models\Disbursement;
use App\Models\User;
use App\Services\DisbursementService;
use Illuminate\Database\Seeder;
use Illuminate\Validation\ValidationException;

/**
 * Demo / defense data for the Payroll → Disbursements integration flow.
 *
 * Because the HR/Payroll subsystem (Group 184) is not yet ready for live
 * API integration, this seeder simulates what their POST /api/disbursements/payroll
 * calls would produce — using the exact same DisbursementService::createPayrollRequest()
 * path so all audit logs, voucher numbering, and notifications work identically
 * to the real integration.
 *
 * Creates payroll batches across multiple departments at different lifecycle
 * stages so Finance staff can demo the full approve → release workflow:
 *   • 2× Pending   — freshly submitted from HR, awaiting Finance review
 *   • 2× Approved  — Finance approved, queued for cash release
 *   • 2× Released  — fully paid out (shows complete lifecycle / history)
 *
 * PREREQUISITES: DepartmentSeeder, CashAccountSeeder, and SuperAdminSeeder
 * (or any UserSeeder) must run first.
 */
class DisbursementPayrollDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (Disbursement::where('source_type', 'payroll')->exists()) {
            $this->command?->info('Payroll demo disbursements already exist — skipping.');
            return;
        }

        $departments = Department::limit(6)->get();
        $cashAccount = CashAccount::where('status', 'Active')->where('account_type', 'Checking')->first()
                    ?? CashAccount::where('status', 'Active')->first()
                    ?? CashAccount::first();
        $requester   = User::first();

        if ($departments->isEmpty() || ! $cashAccount || ! $requester) {
            $this->command?->warn(
                'DisbursementPayrollDemoSeeder skipped: needs at least one '
                . 'Department, CashAccount, and User. Seed those first.'
            );
            return;
        }

        $service  = app(DisbursementService::class);
        $now      = now();
        $deptList = $departments->values();

        // Each entry = one payroll batch from a different department.
        // employee_count and amount_paid are representative per dept type.
        $batches = [
            // ----- PENDING (freshly submitted by HR, Finance must review) -----
            [
                'dept_label'     => 'Operations',
                'batch_suffix'   => '001',
                'employee_count' => 42,
                'amount_paid'    => 1_540_000.00,
                'period'         => 'current-first',
                'target_status'  => 'Pending',
                'remarks'        => 'Semi-monthly payroll — 1st cutoff. Awaiting Finance approval.',
            ],
            [
                'dept_label'     => 'Finance',
                'batch_suffix'   => '002',
                'employee_count' => 15,
                'amount_paid'    => 675_000.00,
                'period'         => 'current-first',
                'target_status'  => 'Pending',
                'remarks'        => 'Semi-monthly payroll — 1st cutoff. Awaiting Finance approval.',
            ],
            // ----- APPROVED (Finance already approved; awaiting cash release) -----
            [
                'dept_label'     => 'HR & Administration',
                'batch_suffix'   => '003',
                'employee_count' => 22,
                'amount_paid'    => 880_000.00,
                'period'         => 'current-first',
                'target_status'  => 'Approved',
                'remarks'        => 'Semi-monthly payroll — 1st cutoff. Approved; pending release.',
            ],
            [
                'dept_label'     => 'Dispatch & Logistics',
                'batch_suffix'   => '004',
                'employee_count' => 58,
                'amount_paid'    => 2_030_000.00,
                'period'         => 'current-first',
                'target_status'  => 'Approved',
                'remarks'        => 'Semi-monthly payroll — 1st cutoff. Approved; pending release.',
            ],
            // ----- RELEASED (prior month — shows full lifecycle history) -----
            [
                'dept_label'     => 'Operations',
                'batch_suffix'   => '005',
                'employee_count' => 42,
                'amount_paid'    => 1_540_000.00,
                'period'         => 'prev-second',
                'target_status'  => 'Released',
                'remarks'        => 'Semi-monthly payroll — 2nd cutoff, prior month. Released.',
            ],
            [
                'dept_label'     => 'Maintenance & Facilities',
                'batch_suffix'   => '006',
                'employee_count' => 19,
                'amount_paid'    => 665_000.00,
                'period'         => 'prev-second',
                'target_status'  => 'Released',
                'remarks'        => 'Semi-monthly payroll — 2nd cutoff, prior month. Released.',
            ],
        ];

        foreach ($batches as $i => $batch) {
            $dept = $deptList[$i % $deptList->count()];

            [$periodStart, $periodEnd, $paymentDate] = $this->resolvePeriod($batch['period'], $now);

            // Prior-month batches get the previous month's prefix to avoid collisions
            $monthKey    = str_starts_with($batch['period'], 'prev')
                ? $now->copy()->subMonthNoOverflow()->format('Ym')
                : $now->format('Ym');
            $batchNumber = 'PR-' . $monthKey . '-' . $batch['batch_suffix'];

            // Ensure the department has an Active budget so the strict budget guard in releasePayroll() succeeds
            Budget::firstOrCreate(
                [
                    'department_id' => $dept->id,
                    'fiscal_year'   => (int) $now->format('Y'),
                    'status'        => 'Active',
                ],
                [
                    'budget_code'        => "BUD-{$dept->id}-" . $now->format('Y'),
                    'budget_name'        => "{$dept->department_name} Annual Operational Budget " . $now->format('Y'),
                    'budget_type'        => 'Operational',
                    'allocated_amount'   => 15_000_000.00,
                    'used_amount'        => 0.00,
                    'remaining_amount'   => 15_000_000.00,
                    'warning_percentage' => 80,
                    'start_date'         => $now->copy()->startOfYear()->toDateString(),
                    'end_date'           => $now->copy()->endOfYear()->toDateString(),
                    'approved_by'        => $requester->id,
                    'approved_at'        => $now->copy()->startOfYear()->toDateTimeString(),
                    'created_by'         => $requester->id,
                ]
            );

            try {
                $record = $service->createPayrollRequest([
                    'department_id'        => $dept->id,
                    'cash_account_id'      => $cashAccount->id,
                    'payee'                => "{$dept->department_name} — {$batch['dept_label']} Payroll",
                    'payroll_batch_number' => $batchNumber,
                    'pay_period_start'     => $periodStart,
                    'pay_period_end'       => $periodEnd,
                    'payment_date'         => $paymentDate,
                    'employee_count'       => $batch['employee_count'],
                    'amount_paid'          => $batch['amount_paid'],
                    'currency'             => 'PHP',
                    'payment_method'       => 'Bank Transfer',
                    'reference_number'     => 'HR-' . $batchNumber,
                    'remarks'              => $batch['remarks'],
                ], $requester->id);

                // Advance to Approved if needed
                if (in_array($batch['target_status'], ['Approved', 'Released'])) {
                    $record = $service->approve($record, $requester->id);
                }

                // Advance to Released if needed
                if ($batch['target_status'] === 'Released') {
                    try {
                        $record = $service->release($record, $requester->id);
                    } catch (ValidationException $e) {
                        // Accounting config not wired yet — leave as Approved, warn only
                        $this->command?->warn(
                            "  ⚠  Could not release {$record->voucher_number} (left as Approved): "
                            . collect($e->errors())->flatten()->first()
                        );
                    }
                }

                $this->command?->info(
                    "  ✓  [{$record->status}] {$record->voucher_number}"
                    . " — {$dept->department_name} | ₱" . number_format($batch['amount_paid'], 2)
                    . " | {$batch['employee_count']} employees"
                );
            } catch (\Throwable $e) {
                $this->command?->warn("  ✗  Batch {$batchNumber} failed: {$e->getMessage()}");
            }
        }

        $this->command?->info('DisbursementPayrollDemoSeeder complete.');
    }

    /**
     * Returns [pay_period_start, pay_period_end, payment_date] for a named period key.
     */
    private function resolvePeriod(string $period, \Carbon\CarbonInterface $now): array
    {
        return match ($period) {
            'current-first' => [
                $now->copy()->startOfMonth()->toDateString(),
                $now->copy()->startOfMonth()->addDays(14)->toDateString(),
                $now->copy()->startOfMonth()->addDays(14)->toDateString(),
            ],
            'current-second' => [
                $now->copy()->startOfMonth()->addDays(15)->toDateString(),
                $now->copy()->endOfMonth()->toDateString(),
                $now->copy()->endOfMonth()->toDateString(),
            ],
            'prev-first' => [
                $now->copy()->subMonthNoOverflow()->startOfMonth()->toDateString(),
                $now->copy()->subMonthNoOverflow()->startOfMonth()->addDays(14)->toDateString(),
                $now->copy()->subMonthNoOverflow()->startOfMonth()->addDays(14)->toDateString(),
            ],
            'prev-second' => [
                $now->copy()->subMonthNoOverflow()->startOfMonth()->addDays(15)->toDateString(),
                $now->copy()->subMonthNoOverflow()->endOfMonth()->toDateString(),
                $now->copy()->subMonthNoOverflow()->endOfMonth()->toDateString(),
            ],
            default => [
                $now->copy()->startOfMonth()->toDateString(),
                $now->copy()->endOfMonth()->toDateString(),
                $now->copy()->endOfMonth()->toDateString(),
            ],
        };
    }
}
