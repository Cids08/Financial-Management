<?php

namespace Database\Seeders;

use App\Models\Budget;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Supplier;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Seeds real expenses rows spread across the last 6 months.
 *
 * Deliberately does NOT set `status` or `receipt_status` — lets the DB's
 * own default apply rather than guessing an enum string.
 *
 * expense_source CONFIRMED via the real CHECK constraint:
 *   CHECK (expense_source IN ('Cash','Bank','Petty Cash'))
 * Cycling through all three rather than hard-coding one, so seeded data
 * isn't unrealistically uniform.
 */
class ExpenseSeeder extends Seeder
{
    private const EXPENSE_SOURCES = ['Cash', 'Bank', 'Petty Cash'];

    public function run(): void
    {
        $budgets = Budget::all();
        $categories = ExpenseCategory::all();
        $user = User::query()->value('id');
        $supplierId = Supplier::query()->value('id'); // nullable column, fine if none exist

        $missing = collect([
            'budgets' => $budgets->isEmpty(),
            'expense_categories' => $categories->isEmpty(),
            'users' => ! $user,
        ])->filter()->keys();

        if ($missing->isNotEmpty()) {
            throw new RuntimeException(
                'ExpenseSeeder needs existing rows in: ' . $missing->implode(', ') . '. Seed those first.'
            );
        }

        $today = Carbon::today();
        $count = 14;
        $descriptions = [
            'Site fuel and transportation', 'Office supplies restock', 'Equipment maintenance',
            'Utility bill payment', 'Crane rental — short term', 'Safety gear procurement',
            'Client meeting expenses', 'Software subscription renewal',
        ];

        for ($i = 0; $i < $count; $i++) {
            $daysAgo = $i < 8 ? random_int(0, 29) : random_int(30, 179);
            $date = $today->copy()->subDays($daysAgo);
            $budget = $budgets[$i % $budgets->count()];
            $category = $categories[$i % $categories->count()];

            Expense::updateOrCreate(
                ['receipt_number' => sprintf('EXP-SEED-%03d', $i + 1)],
                [
                    'budget_id' => $budget->id,
                    'expense_category_id' => $category->id,
                    'supplier_id' => $supplierId,
                    'expense_date' => $date->toDateString(),
                    'expense_amount' => round(random_int(1500, 45000), 2),
                    'expense_source' => self::EXPENSE_SOURCES[$i % count(self::EXPENSE_SOURCES)],
                    'description' => $descriptions[$i % count($descriptions)],
                    'is_over_budget' => false,
                    'created_by' => $user,
                    // status / receipt_status: intentionally omitted — let DB defaults apply.
                ]
            );
        }
    }
}