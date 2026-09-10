<?php

namespace App\Policies;

use App\Models\Budget;
use App\Models\User;

class BudgetPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('budgets.view');
    }

    public function view(User $user, Budget $budget): bool
    {
        return $user->hasPermission('budgets.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('budgets.manage');
    }

    public function update(User $user, Budget $budget): bool
    {
        return $user->hasPermission('budgets.manage') && $budget->status === 'Draft';
    }

    public function approve(User $user, Budget $budget): bool
    {
        return $user->hasPermission('budgets.approve');
    }

    public function delete(User $user, Budget $budget): bool
    {
        return $user->hasPermission('budgets.manage');
    }

    public function restore(User $user, Budget $budget): bool
    {
        return $user->hasPermission('budgets.manage');
    }
}