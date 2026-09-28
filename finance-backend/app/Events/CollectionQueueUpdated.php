<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Broadcast whenever an AR invoice is assigned, reassigned, or updated,
 * so the Collections page's awaiting invoice queue updates in real-time.
 *
 * Uses ShouldBroadcastNow so the event fires immediately via Reverb.
 */
class CollectionQueueUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly array $data = [])
    {
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('collections'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'collection.queue.updated';
    }

    public function broadcastWith(): array
    {
        return $this->data;
    }
}
