<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AccountsPayableResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'ap_id' => $this->id,
            'supplier_id' => $this->supplier_id,
            // Only populated when ->with('supplier') was used — saves the
            // frontend a separate lookup against the suppliers list.
            'supplier_name' => $this->whenLoaded('supplier', fn () => $this->supplier?->supplier_name),
            'invoice_number' => $this->invoice_number,
            'invoice_date' => $this->invoice_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'purchase_order_no' => $this->purchase_order_no,
            // Frontend field is `amount` — real column is `original_amount`.
            'amount' => (float) $this->original_amount,
            'paid_amount' => (float) $this->paid_amount,
            'remaining_balance' => (float) $this->remaining_balance,
            'currency' => $this->currency,
            'payment_method' => $this->payment_method,
            'billing_address' => $this->billing_address,
            // Frontend field is `description` — real column is `remarks`.
            'description' => $this->remarks,
            'reference_number' => $this->reference_number,
            'status' => $this->status,
            'has_attachment' => (bool) $this->has_attachment,
            'created_by' => $this->created_by,
            'created_by_name' => $this->whenLoaded('creator', fn () => $this->creator?->fullName()),
            'approved_by' => $this->approved_by,
            'approved_by_name' => $this->whenLoaded('approver', fn () => $this->approver?->fullName()),
            'approved_at' => $this->approved_at?->toIso8601String(),
            // No is_archived/archived_at/archived_by columns — soft-delete
            // via deleted_at/deleted_by, same pattern as users.
            'is_archived' => $this->deleted_at !== null,
            'archived_at' => $this->deleted_at?->toIso8601String(),
            'archived_by' => $this->deleted_by,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}