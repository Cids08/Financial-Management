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
     */
    public function listForUser(User $user, bool $unreadOnly = false): LengthAwarePaginator
    {
        $query = Notification::forUser($user->id)->latest();

        if ($unreadOnly) {
            $query->unread();
        }

        return $query->paginate(self::PER_PAGE);
    }

    public function unreadCount(User $user): int
    {
        return Notification::forUser($user->id)->unread()->count();
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