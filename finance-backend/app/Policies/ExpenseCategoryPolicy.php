<?php

namespace App\Policies;

use App\Models\ExpenseCategory;
use App\Models\User;

class ExpenseCategoryPolicy
{
    /**
     * Permission strings match routes/api.php's existing
     * `permission:expense-categories.*` middleware — see ExpensePolicy's
     * docblock for why most methods below re-check a permission the
     * route already enforces (harmless, defense-in-depth) rather than
     * inventing new rules. There's no approval workflow on categories
     * (unlike Expense/Budget/AccountsPayable), so this Policy is
     * intentionally simpler than those — just view/manage, no approve,
     * no idempotency guard tied to a status field.
     */

    public function viewAny(User $user): bool
    {
        return $user->hasPermission('expense-categories.view');
    }

    public function view(User $user, ExpenseCategory $expenseCategory): bool
    {
        return $user->hasPermission('expense-categories.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('expense-categories.manage');
    }

    public function update(User $user, ExpenseCategory $expenseCategory): bool
    {
        return $user->hasPermission('expense-categories.manage');
    }

    public function archive(User $user, ExpenseCategory $expenseCategory): bool
    {
        return $user->hasPermission('expense-categories.manage');
    }

    public function restore(User $user, ExpenseCategory $expenseCategory): bool
    {
        return $user->hasPermission('expense-categories.manage');
    }
}