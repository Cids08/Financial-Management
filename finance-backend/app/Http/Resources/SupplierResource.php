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
            'category' => $this->category,
            'contact_person' => $this->contact_person,
            'position' => $this->position,
            'contact_number' => $this->contact_number,
            'tin' => $this->tin,
            'email' => $this->email,
            'website' => $this->website,
            'address' => $this->address,
            'credit_limit' => (float) $this->credit_limit,
            'current_balance' => (float) $this->current_balance,
            'payment_terms' => $this->payment_terms ?: 'Net 30',
            'contract_ref' => $this->contract_ref,
            'contract_expiry' => $this->contract_expiry ? (is_string($this->contract_expiry) ? substr($this->contract_expiry, 0, 10) : $this->contract_expiry->format('Y-m-d')) : null,
            'status' => $this->status,
            'default_withholding_type' => $this->default_withholding_type,
            'is_archived' => $this->deleted_at !== null,
            'deleted_at' => $this->deleted_at?->toIso8601String(),
        ];
    }
}