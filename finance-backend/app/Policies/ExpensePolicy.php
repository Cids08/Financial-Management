<?php

namespace App\Policies;

use App\Models\Expense;
use App\Models\User;

class ExpensePolicy
{
    /**
     * Permission strings match routes/api.php's existing
     * `permission:expenses.*` middleware on the Expenses route group —
     * NOT a separate naming scheme. Route middleware already gates "does
     * this user have the permission at all" (and is what actually keeps
     * Staff/Collector roles out of approve/reject, by simply not having
     * expenses.approve granted to them in Roles & Permissions); this
     * Policy exists for the record-specific rules middleware can't
     * express (is *this* expense still Pending, has *this* one already
     * been approved) — so most methods below re-check the same
     * permission the route already enforces (harmless, defense-in-depth)
     * and then add the extra rule.
     *
     * hasPermission() (App\Models\User) also short-circuits true for
     * Super Admin — same bypass CheckPermission middleware relies on.
     */

    public function viewAny(User $user): bool
    {
        return $user->hasPermission('expenses.view');
    }

    public function view(User $user, Expense $expense): bool
    {
        return $user->hasPermission('expenses.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('expenses.manage'); // store route uses expenses.manage, not a separate expenses.create
    }

    public function update(User $user, Expense $expense): bool
    {
        // Only Pending expenses may be edited. Once an expense is Approved it
        // has already moved budget numbers and posted a journal entry — editing
        // in place would silently desync both. Rejected expenses must also go
        // through a fresh submission rather than an in-place edit, to maintain
        // a clear audit trail.
        if ($expense->status !== Expense::STATUS_PENDING) {
            return false;
        }

        return $user->hasPermission('expenses.manage');
    }

    public function approve(User $user, Expense $expense): bool
    {
        if ($expense->status !== Expense::STATUS_PENDING) {
            return false; // already approved/rejected — idempotency guard
        }

        return $user->hasPermission('expenses.approve');
    }

    public function reject(User $user, Expense $expense): bool
    {
        if ($expense->status !== Expense::STATUS_PENDING) {
            return false; // idempotency guard, same as approve()
        }

        return $user->hasPermission('expenses.approve');
    }

    public function archive(User $user, Expense $expense): bool
    {
        // Only decided/completed expenses (Approved or Rejected) can be archived.
        // Pending expense requests must be reviewed first and cannot be swept away.
        // Archiving an approved expense keeps its General Ledger journal entry permanently posted.
        if ($expense->status === Expense::STATUS_PENDING) {
            return false;
        }

        return $user->hasPermission('expenses.manage'); // archive route uses expenses.manage per routes/api.php
    }

    public function restore(User $user, Expense $expense): bool
    {
        return $user->hasPermission('expenses.manage'); // restore route uses expenses.manage per routes/api.php
    }
}