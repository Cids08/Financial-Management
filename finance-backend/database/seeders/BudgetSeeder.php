<?php

namespace Database\Seeders;

use App\Models\Budget;
use App\Models\Department;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * One active budget per department (active = today falls within
 * start_date/end_date — a real date-range check, not a guessed status
 * string, same reasoning DashboardChartService::getBudgetUtilization()
 * already uses).
 *
 * budget_type CONFIRMED via the real CHECK constraint:
 *   CHECK (budget_type IN ('Operational','Capital','Project','Emergency'))
 * Using 'Operational'.
 */
class BudgetSeeder extends Seeder
{
    public function run(): void
    {
        $departments = Department::where('is_active', true)->get();
        $userId = User::query()->value('id');

        if ($departments->isEmpty() || ! $userId) {
            throw new RuntimeException('BudgetSeeder needs existing rows in: departments, users. Seed those first.');
        }

        $today = Carbon::today();
        $start = $today->copy()->startOfYear();
        $end = $today->copy()->endOfYear();

        foreach ($departments as $i => $department) {
            $allocated = [500000, 350000, 200000, 300000, 150000][$i % 5];
            $used = round($allocated * (random_int(20, 65) / 100), 2);

            // Matched on department_id + fiscal_year rather than a
            // budget_code built from department_code — the real
            // departments table doesn't populate department_code, so a
            // code-based key would've silently collided across departments.
            Budget::updateOrCreate(
                ['department_id' => $department->id, 'fiscal_year' => $today->year],
                [
                    'budget_code' => "BUD-{$department->id}-{$today->year}",
                    'budget_name' => "{$department->department_name} Annual Budget {$today->year}",
                    'budget_type' => 'Operational',
                    'allocated_amount' => $allocated,
                    'used_amount' => $used,
                    'remaining_amount' => round($allocated - $used, 2),
                    'warning_percentage' => 80,
                    'start_date' => $start->toDateString(),
                    'end_date' => $end->toDateString(),
                    'created_by' => $userId,
                    // status: intentionally omitted — let the DB default ('Draft') apply.
                ]
            );
        }
    }
}