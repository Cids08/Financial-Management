<?php

namespace App\Policies;

use App\Models\Collection;
use App\Models\User;

/**
 * Record-level authorization for Collections.
 *
 * Route-level guards (middleware('permission:collections.*')) already
 * block users who lack the permission entirely. This Policy adds the
 * second layer: record-level checks that the route middleware can't do
 * (e.g. "is this collection still pending?", "is the actor the creator?").
 *
 * Register in AuthServiceProvider:
 *   use App\Models\Collection;
 *   use App\Policies\CollectionPolicy;
 *   ...
 *   protected $policies = [
 *       Collection::class => CollectionPolicy::class,
 *   ];
 *
 * Usage in CollectionController (before any service call):
 *   $this->authorize('confirm', $collection);
 *   $this->authorize('cancel',  $collection);
 *   $this->authorize('update',  $collection);
 *   $this->authorize('archive', $collection);
 *   $this->authorize('restore', $collection);
 *
 * NOTE: hasPermission() already exists on your User model (User.php) —
 * super-admin bypasses all checks, all other roles go through the
 * role()->permissions relationship. No changes needed to User.php.
 */
class CollectionPolicy
{
    /**
     * View any collection (list + detail).
     * Mirrors: middleware('permission:collections.view')
     */
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('collections.view');
    }

    /**
     * View a single collection record.
     */
    public function view(User $user, Collection $collection): bool
    {
        return $user->hasPermission('collections.view');
    }

    /**
     * Create a new collection.
     * Mirrors: middleware('permission:collections.manage')
     */
    public function create(User $user): bool
    {
        return $user->hasPermission('collections.manage');
    }

    /**
     * Update a collection — blocked at record level if already confirmed.
     * The service and UpdateCollectionRequest both enforce this too, but
     * the Policy is the earliest possible rejection point.
     * Mirrors: middleware('permission:collections.manage')
     */
    public function update(User $user, Collection $collection): bool
    {
        if (! $user->hasPermission('collections.manage')) {
            return false;
        }

        // Confirmed collections cannot be edited — the financial side effects
        // (AR balance, cash account, journal entry) are already committed.
        return $collection->status !== Collection::STATUS_CONFIRMED;
    }

    /**
     * Confirm a pending collection.
     * collections.confirm is deliberately withheld from 'collector' and
     * 'staff' roles in RolesAndPermissionsSeeder — only admin/super-admin
     * can confirm, matching the real-world two-person control requirement.
     * Mirrors: middleware('permission:collections.confirm')
     */
    public function confirm(User $user, Collection $collection): bool
    {
        if (! $user->hasPermission('collections.confirm')) {
            return false;
        }

        // Only pending collections can be confirmed — same guard as the
        // service, but caught here before the DB transaction even opens.
        return $collection->status === Collection::STATUS_PENDING;
    }

    /**
     * Cancel a pending collection.
     * Requires collections.confirm — cancellation is a financial decision
     * with the same authority requirement as confirmation.
     * Mirrors: middleware('permission:collections.confirm')
     */
    public function cancel(User $user, Collection $collection): bool
    {
        if (! $user->hasPermission('collections.confirm')) {
            return false;
        }

        // Only pending collections can be cancelled.
        return $collection->status === Collection::STATUS_PENDING;
    }

    /**
     * Soft-delete (archive) a collection.
     * Mirrors: middleware('permission:collections.manage')
     */
    public function archive(User $user, Collection $collection): bool
    {
        if (! $user->hasPermission('collections.manage')) {
            return false;
        }

        // Confirmed collections should not be silently archived — they have
        // committed journal entries and AR balance changes. Force the caller
        // to cancel first (which itself requires collections.confirm), then
        // archive. Adjust this guard if your business rules differ.
        return $collection->status !== Collection::STATUS_CONFIRMED;
    }

    /**
     * Restore a soft-deleted collection.
     * Mirrors: middleware('permission:collections.manage')
     */
    public function restore(User $user, Collection $collection): bool
    {
        return $user->hasPermission('collections.manage');
    }
}