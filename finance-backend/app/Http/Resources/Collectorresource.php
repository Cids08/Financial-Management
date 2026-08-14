<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CollectorResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            // Matches Collectors.jsx's mock shape 1:1 so it's a drop-in
            // replacement for `initialCollectors` — id -> collector_id,
            // phone_number -> contact_no, deleted_at -> is_archived.
            'collector_id'    => $this->id,
            'employee_no'     => $this->employee_no,
            'first_name'      => $this->first_name,
            'middle_name'     => $this->middle_name,
            'last_name'       => $this->last_name,
            'contact_no'      => $this->phone_number,
            'email'           => $this->email,
            'profile_photo'   => $this->profile_photo
                ? asset('storage/' . ltrim($this->profile_photo, '/'))
                : null,
            'assigned_area'   => $this->assigned_area,
            'service_area_id' => $this->service_area_id,
            'service_area_name' => $this->whenLoaded('serviceArea', fn () => $this->serviceArea?->name),
            'commission_rate' => (float) $this->commission_rate,
            'monthly_target'  => (float) $this->monthly_target,
            'is_active'       => $this->status === 'Active',
            'is_archived'     => $this->trashed(),
        ];
    }
}