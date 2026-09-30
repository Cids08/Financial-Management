<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Generic refetch signal for any supported data module.
 *
 * Emitted by DataUpdateObserver whenever a watched model is created,
 * updated, deleted or restored. It carries only a module slug, an action
 * and the row id — deliberately NOT hydrated data — so the frontend uses
 * it as a signal to re-fetch the affected page via the normal API (which
 * enforces its own permission checks). This mirrors the philosophy of
 * CollectionStatusChanged and keeps payloads from drifting out of sync
 * with the API resources.
 *
 * Channel: private-data  (all authenticated users)
 * Event:   data.updated
 * Payload: { module, action, id, occurred_at }
 */
class DataUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(
        public string $module,
        public string $action,
        public int|string|null $id = null,
    ) {
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel('data')];
    }

    public function broadcastAs(): string
    {
        return 'data.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'module'      => $this->module,
            'action'      => $this->action,
            'id'          => $this->id,
            'occurred_at' => now()->toIso8601String(),
        ];
    }
}