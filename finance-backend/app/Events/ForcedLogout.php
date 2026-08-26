<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

class ForcedLogout implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    /**
     * @param int $userId Whose sessions were affected.
     * @param string|null $originSessionId The client_session_id of the
     *        device that just logged in and triggered this — that device
     *        must NOT log itself out on receipt, since it's the new,
     *        legitimate session. Every other listener compares this
     *        against its own client_session_id and only acts if different.
     * @param string $deviceLabel Human-readable label of the new login
     *        ("Chrome on Windows"), shown in the modal so the person
     *        signed out elsewhere knows what happened.
     */
    public function __construct(
        public int $userId,
        public ?string $originSessionId,
        public string $deviceLabel,
    ) {
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel("user.{$this->userId}")];
    }

    public function broadcastAs(): string
    {
        return 'forced.logout';
    }

    public function broadcastWith(): array
    {
        return [
            'originSessionId' => $this->originSessionId,
            'deviceLabel' => $this->deviceLabel,
        ];
    }
}