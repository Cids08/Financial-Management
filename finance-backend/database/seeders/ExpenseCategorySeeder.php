<?php

namespace Database\Seeders;

use App\Models\ExpenseCategory;
use Illuminate\Database\Seeder;

class ExpenseCategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['category_code' => 'OFFICE', 'category_name' => 'Office Supplies'],
            ['category_code' => 'UTIL', 'category_name' => 'Utilities'],
            ['category_code' => 'TRAVEL', 'category_name' => 'Travel'],
            ['category_code' => 'MKT', 'category_name' => 'Marketing'],
            ['category_code' => 'MAINT', 'category_name' => 'Maintenance'],
            ['category_code' => 'PROF', 'category_name' => 'Professional Fees'],
            ['category_code' => 'OTHER', 'category_name' => 'Other'],
        ];

        foreach ($categories as $category) {
            ExpenseCategory::updateOrCreate(
                ['category_code' => $category['category_code']],
                [...$category, 'is_active' => true]
            );
        }

        $this->command?->info('Seeded ' . count($categories) . ' expense categories.');
    }
}