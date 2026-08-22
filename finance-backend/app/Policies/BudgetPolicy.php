<?php

namespace App\Policies;

use App\Models\Budget;
use App\Models\User;

class BudgetPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('budgets.view');
    }

    public function create(User $user): bool
    {
        return $user->can('budgets.create');
    }

    public function update(User $user, Budget $budget): bool
    {
        return $user->can('budgets.update') && $budget->status !== 'Approved';
    }

    // NOTE: replace 'budgets.approve' with whatever permission slug your
    // role_permissions table actually uses for CEO-level budget approval —
    // this project's business rules say that decision belongs to the CEO.
    public function approve(User $user, Budget $budget): bool
    {
        return $user->can('budgets.approve');
    }

    public function delete(User $user, Budget $budget): bool
    {
        return $user->can('budgets.archive');
    }

    public function restore(User $user, Budget $budget): bool
    {
        return $user->can('budgets.archive');
    }
}