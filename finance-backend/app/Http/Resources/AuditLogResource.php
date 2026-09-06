<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                    => $this->id,
            'module'                => $this->module,
            'action'                => $this->action,
            'record_id'             => $this->record_id,
            'activity_description'  => $this->activity_description,
            'old_values'            => $this->old_values,
            'new_values'            => $this->new_values,
            'ip_address'            => $this->ip_address,
            'user_agent'            => $this->user_agent,
            'user_id'               => $this->user_id,
            'user_name'             => $this->whenLoaded('user', fn () => $this->user
                ? trim("{$this->user->first_name} {$this->user->last_name}")
                : null),
            'created_at'            => $this->created_at?->toIso8601String(),
        ];
    }
}