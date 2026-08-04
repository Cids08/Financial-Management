<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'device' => $this->name,
            'ip' => $this->ip_address,
            'userAgent' => $this->user_agent,
            'lastActive' => optional($this->last_used_at)->toIso8601String(),
            'createdAt' => $this->created_at->toIso8601String(),
            'location' => $this->location,
        ];
    }
}