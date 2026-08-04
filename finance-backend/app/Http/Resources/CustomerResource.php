<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CustomerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'customer_id' => $this->id,
            'customer_code' => $this->customer_code,
            'customer_name' => $this->customer_name,
            'contact_person' => $this->contact_person,
            'contact_number' => $this->contact_number,
            'email' => $this->email,
            'address' => $this->address,
            'TIN' => $this->tin,
            'credit_limit' => (float) $this->credit_limit,
            'current_balance' => (float) $this->current_balance,
            'status' => $this->status,
            'is_archived' => $this->deleted_at !== null,
        ];
    }
}