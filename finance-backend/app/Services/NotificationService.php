<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class NotificationService
{
    protected const PER_PAGE = 15;

    /**
     * Paginated notifications for the given user, most recent first.
     *
     * FIX: previously hardcoded self::PER_PAGE regardless of what the
     * frontend requested (Notifications.jsx sends 20, the header bell
     * preview sends 5) — the controller/hook both imply per_page is
     * configurable, so it should actually be honored here.
     */
    public function listForUser(User $user, bool $unreadOnly = false, int $perPage = self::PER_PAGE): LengthAwarePaginator
    {
        $query = Notification::forUser($user->id)->latest();

        if ($unreadOnly) {
            $query->unread();
        }

        return $query->paginate($perPage);
    }

    public function unreadCount(User $user): int
    {
        return Notification::forUser($user->id)->unread()->count();
    }

    /**
     * Create a notification for a single user.
     *
     * This is the missing piece: nothing in the original service ever
     * inserted a row, so the notifications table stayed empty no matter
     * what happened elsewhere in the app (expense approvals, budget
     * overages, disbursement releases, etc.). Business-logic services
     * (ExpenseService, DisbursementService, CollectionService, BudgetService,
     * ...) should call this at the point an event worth notifying about
     * occurs.
     *
     * $type should match one of the keys NOTIFICATION_TYPE_META expects
     * on the frontend (src/utils/notificationTypes.js): receivable,
     * payable, budget, budget_over, budget_warning, expense, collection,
     * disbursement, forecast, ai_recommendation — or it'll silently fall
     * back to the generic Bell/"General" display there.
     */
    public function create(int $userId, string $type, string $title, string $message): Notification
    {
        return Notification::create([
            'user_id' => $userId,
            'type'    => $type,
            'title'   => $title,
            'message' => $message,
            'is_read' => false,
        ]);
    }

    /**
     * Convenience wrapper for notifying several users at once — e.g. every
     * Admin when a company-wide event happens (a budget is exceeded, a
     * disbursement is released), rather than just the record's owner.
     *
     * @param  iterable<int>  $userIds
     * @return list<Notification>
     */
    public function createForMany(iterable $userIds, string $type, string $title, string $message): array
    {
        $created = [];

        foreach ($userIds as $userId) {
            $created[] = $this->create($userId, $type, $title, $message);
        }

        return $created;
    }

    public function markAsRead(User $user, Notification $notification): Notification
    {
        $this->authorizeOwnership($user, $notification);

        if (! $notification->is_read) {
            $notification->update([
                'is_read' => true,
                'read_at' => now(),
            ]);
        }

        return $notification->fresh();
    }

    public function markAllAsRead(User $user): int
    {
        return Notification::forUser($user->id)
            ->unread()
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);
    }

    public function delete(User $user, Notification $notification): void
    {
        $this->authorizeOwnership($user, $notification);

        $notification->delete();
    }

    /**
     * A notification belongs to exactly one user; never let one user
     * read, mark, or delete another user's notification via a guessed ID.
     */
    protected function authorizeOwnership(User $user, Notification $notification): void
    {
        abort_if($notification->user_id !== $user->id, 403, 'This notification does not belong to you.');
    }
}