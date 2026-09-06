<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ExpenseCategory;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ExpenseCategoryService
{
    // Fields captured in AuditLog.old_values/new_values — the category's
    // actual data, not timestamps. Mirrors ExpenseService's pattern.
    protected const AUDITED_FIELDS = ['category_code', 'category_name', 'description', 'is_active'];

    public function create(array $data, User $creator): ExpenseCategory
    {
        return DB::transaction(function () use ($data, $creator) {
            $category = ExpenseCategory::create([
                ...$data,
                'is_active' => $data['is_active'] ?? true,
            ]);

            AuditLog::create([
                'user_id' => $creator->id,
                'module' => 'Expense Categories',
                'action' => 'create',
                'record_id' => $category->id,
                'activity_description' => "Created expense category \"{$category->category_name}\" ({$category->category_code}).",
                'new_values' => $category->only(self::AUDITED_FIELDS),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $category;
        });
    }

    public function update(ExpenseCategory $category, array $data, User $actor): ExpenseCategory
    {
        $original = $category->only(self::AUDITED_FIELDS);

        DB::transaction(function () use ($category, $data, $actor, $original) {
            $category->update($data);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Expense Categories',
                'action' => 'update',
                'record_id' => $category->id,
                'activity_description' => "Updated expense category \"{$category->category_name}\" ({$category->category_code}).",
                'old_values' => $original,
                'new_values' => $category->only(self::AUDITED_FIELDS),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });

        return $category->refresh();
    }

    public function archive(ExpenseCategory $category, User $actor): void
    {
        DB::transaction(function () use ($category, $actor) {
            // No deleted_by column on expense_categories (unlike expenses/
            // budgets/tax_obligations) — who archived it is only
            // recoverable from this AuditLog row, not from the record
            // itself.
            $category->delete();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Expense Categories',
                'action' => 'archive',
                'record_id' => $category->id,
                'activity_description' => "Archived expense category \"{$category->category_name}\" ({$category->category_code}).",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    public function restore(ExpenseCategory $category, User $actor): ExpenseCategory
    {
        DB::transaction(function () use ($category, $actor) {
            $category->restore();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Expense Categories',
                'action' => 'restore',
                'record_id' => $category->id,
                'activity_description' => "Restored expense category \"{$category->category_name}\" ({$category->category_code}).",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });

        return $category->refresh();
    }
}