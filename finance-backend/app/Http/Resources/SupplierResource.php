<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupplierResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'supplier_id' => $this->id,
            'supplier_code' => $this->supplier_code,
            'supplier_name' => $this->supplier_name,
            'contact_person' => $this->contact_person,
            'position' => $this->position,
            'contact_number' => $this->contact_number,
            'email' => $this->email,
            'website' => $this->website,
            'address' => $this->address,
            'current_balance' => (float) $this->current_balance,
            'status' => $this->status,
            'is_archived' => $this->deleted_at !== null,
        ];
    }
}