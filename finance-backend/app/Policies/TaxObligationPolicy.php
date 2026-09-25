<?php

namespace App\Policies;

use App\Models\TaxObligation;
use App\Models\User;

class TaxObligationPolicy
{
    /**
     * Permission strings match routes/api.php's existing
     * `permission:tax.*` middleware on the Tax Obligations route group —
     * NOT a separate naming scheme. Route middleware already gates "does
     * this user have the permission at all"; this Policy exists so
     * StoreTaxObligationRequest/UpdateTaxObligationRequest's
     * `$this->user()->can('create'/'update', ...)` checks resolve, and to
     * add the record-level rules middleware can't express (an already-Paid
     * obligation is frozen).
     *
     * hasPermission() (App\Models\User) short-circuits true for Super
     * Admin/Admin — same bypass CheckPermission middleware relies on.
     */

    public function viewAny(User $user): bool
    {
        return $user->hasPermission('tax.view');
    }

    public function view(User $user, TaxObligation $obligation): bool
    {
        return $user->hasPermission('tax.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('tax.manage'); // store route uses tax.manage, not a separate tax.create
    }

    public function update(User $user, TaxObligation $obligation): bool
    {
        // A Paid obligation has already posted its linked, approved Expense
        // + GL journal entry — editing it in place would silently desync
        // the two. TaxObligationService::update() enforces the same rule;
        // this mirrors it so the denial is cheap and explicit at the
        // request-authorization layer.
        if ($obligation->status === 'Paid') {
            return false;
        }

        return $user->hasPermission('tax.manage');
    }

    public function archive(User $user, TaxObligation $obligation): bool
    {
        // Only settled (Paid) obligations can be archived — in-flight and
        // overdue ones must remain on the active schedule. Same rule the
        // service enforces; mirroring it here.
        if ($obligation->status !== 'Paid') {
            return false;
        }

        return $user->hasPermission('tax.manage');
    }

    public function restore(User $user, TaxObligation $obligation): bool
    {
        return $user->hasPermission('tax.manage');
    }

    public function recordPayment(User $user, TaxObligation $obligation): bool
    {
        if ($obligation->status === 'Paid') {
            return false; // already settled — idempotency guard
        }

        return $user->hasPermission('tax.manage');
    }

    public function attachDocument(User $user, TaxObligation $obligation): bool
    {
        return $user->hasPermission('tax.manage');
    }
}