<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Tells a single user their notification queue changed so the header
 * badge (and the notifications page) can refresh instantly instead of
 * waiting for the 30s poll.
 *
 * Channel: private-user.{id}
 * Event:   notification.created
 * Payload: { id, unread_count }
 */
class NotificationCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(
        public int $userId,
        public int $notificationId,
        public int $unreadCount,
    ) {
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel("user.{$this->userId}")];
    }

    public function broadcastAs(): string
    {
        return 'notification.created';
    }

    public function broadcastWith(): array
    {
        return [
            'id'          => $this->notificationId,
            'unread_count' => $this->unreadCount,
        ];
    }
}