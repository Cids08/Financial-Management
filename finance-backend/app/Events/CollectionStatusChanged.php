<?php

namespace App\Events;

use App\Models\Collection;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Broadcast whenever a collection is confirmed or cancelled.
 *
 * Uses ShouldBroadcastNow (not ShouldBroadcast) so the event fires
 * synchronously inside the existing DB transaction — no queue worker
 * required, and the frontend receives the update the moment the status
 * change commits. If you later add a queue, swap to ShouldBroadcast and
 * ensure the queue worker has DB access.
 *
 * Channel: private-collections
 * Event:   collection.status.changed
 * Payload: { id, status, received_by, updated_at }
 *
 * The payload is intentionally minimal — the frontend uses it as a
 * signal to call refetch(), not to patch local state directly. This
 * avoids the frontend ever holding a partially-hydrated record.
 */
class CollectionStatusChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly Collection $collection)
    {
    }

    public function broadcastOn(): array
    {
        // Single private channel — all authenticated users watching the
        // collections page receive the event. If you later need per-user
        // or per-role scoping, replace with PrivateChannel("collections.{$userId}")
        // and update the Echo listener in useCollectionUpdates.js accordingly.
        return [
            new PrivateChannel('collections'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'collection.status.changed';
    }

    public function broadcastWith(): array
    {
        return [
            'id'          => $this->collection->id,
            'status'      => $this->collection->status,
            'received_by' => $this->collection->received_by,
            'updated_at'  => $this->collection->updated_at?->toIso8601String(),
        ];
    }
}