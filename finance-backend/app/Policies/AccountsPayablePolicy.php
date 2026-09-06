<?php

namespace App\Policies;

use App\Models\AccountsPayable;
use App\Models\User;

class AccountsPayablePolicy
{
    /**
     * Permission strings match routes/api.php's existing
     * `permission:ap.*` middleware on the Accounts Payable route group —
     * NOT a separate naming scheme. Route middleware already gates "does
     * this user have the permission at all"; this Policy exists for the
     * record-specific rules middleware can't express (is *this* bill
     * already approved, did *this* user create *this* bill) — so most
     * methods below re-check the same permission the route already
     * enforces (harmless, defense-in-depth) and then add the extra rule.
     *
     * hasPermission() (App\Models\User) also short-circuits true for
     * Super Admin — same bypass CheckPermission middleware relies on.
     */

    public function viewAny(User $user): bool
    {
        return $user->hasPermission('ap.view');
    }

    public function view(User $user, AccountsPayable $bill): bool
    {
        return $user->hasPermission('ap.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('ap.manage'); // store route uses ap.manage, not a separate ap.create
    }

    public function update(User $user, AccountsPayable $bill): bool
    {
        // Once a bill is approved, editing it should go through a
        // corrective/void flow rather than a silent edit — block plain
        // updates on approved bills even for users who otherwise have
        // ap.manage.
        if ($bill->approved_by !== null) {
            return false;
        }

        // status and approved_by aren't actually linked in this system —
        // status is a free dropdown anyone with ap.manage can set by
        // hand, so a bill can be marked 'Paid' or 'Cancelled' with
        // approved_by still null (no real payment/approval ever
        // happened). Block edits on those terminal statuses directly so
        // a "Paid" or "Cancelled" bill can't be silently rewritten either
        // way — via approval or via status.
        if (in_array($bill->status, ['Paid', 'Cancelled'], true)) {
            return false;
        }

        return $user->hasPermission('ap.manage');
    }

    public function approve(User $user, AccountsPayable $bill): bool
    {
        if ($bill->approved_by !== null) {
            return false; // already approved — idempotency guard
        }

        // Segregation of duties: the person who created the bill
        // shouldn't be the one approving it.
        if ($bill->created_by === $user->id) {
            return false;
        }

        return $user->hasPermission('ap.approve');
    }

    public function archive(User $user, AccountsPayable $bill): bool
    {
        // An approved bill has a real journal entry posted against it
        // (see AccountsPayableService::approve() / postApprovalJournalEntry()).
        // Archiving is a soft-delete on the AP row only — it has no way to
        // reverse that ledger entry, so letting an approved bill be
        // archived would leave a permanent, untraceable expense sitting
        // in the general ledger with no corresponding active bill.
        // A real void/reversal flow would need to exist before this is
        // safe to allow; until then, block it outright.
        if ($bill->approved_by !== null) {
            return false;
        }

        return $user->hasPermission('ap.manage'); // archive route uses ap.manage per routes/api.php
    }

    public function restore(User $user, AccountsPayable $bill): bool
    {
        return $user->hasPermission('ap.manage'); // restore route uses ap.manage per routes/api.php
    }

    /**
     * Attaching a supporting document (invoice scan/photo) is pure
     * documentation with no ledger or approval-workflow impact — unlike
     * update(), it's NOT blocked by approved_by or a Paid/Cancelled
     * status. Same reasoning ExpenseService::attachReceipt() documents
     * for its own equivalent: re-evaluate this if that assumption ever
     * changes (e.g. if attaching a document should also mutate
     * has_attachment in a way that matters to an already-closed bill).
     */
    public function attachDocument(User $user, AccountsPayable $bill): bool
    {
        return $user->hasPermission('ap.manage');
    }
}