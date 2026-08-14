<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaxObligationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'tax_id'            => $this->id,
            'tax_type'          => $this->tax_type,
            'tax_period'        => $this->tax_period,
            'tax_rate'          => (float) $this->tax_rate,
            'taxable_amount'    => (float) $this->taxable_amount,
            // Frontend historically called this "amount" — tax_amount is
            // the real ERD column and the actual number owed/paid.
            'amount'            => (float) $this->tax_amount,
            'due_date'          => $this->due_date?->toDateString(),
            'payment_date'      => $this->payment_date?->toDateString(),
            'reference_number'  => $this->reference_number,
            // Stored column is only ever 'Pending'/'Paid' — this is the
            // live derived value ('Overdue' included), same rule the
            // frontend already applies client-side, just computed here
            // too so any consumer of the API sees the same thing.
            'status'            => $this->derivedStatus(),
            'remarks'           => $this->remarks,
            'created_by'        => $this->created_by,
            'created_by_name'   => $this->whenLoaded('createdBy', fn () => trim("{$this->createdBy?->first_name} {$this->createdBy?->last_name}")),
            'created_at'        => $this->created_at?->toIso8601String(),
            'updated_at'        => $this->updated_at?->toIso8601String(),
            'is_archived'       => $this->trashed(),
            'archived_at'       => $this->deleted_at?->toIso8601String(),
            'archived_by'       => $this->deleted_by,
            'archived_by_name'  => $this->whenLoaded('deletedBy', fn () => $this->deletedBy ? trim("{$this->deletedBy->first_name} {$this->deletedBy->last_name}") : null),
        ];
    }
}