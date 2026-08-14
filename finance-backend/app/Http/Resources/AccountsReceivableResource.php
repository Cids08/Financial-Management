<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Deliberately returns snake_case keys (ar_id, customer_id, original_amount, ...)
 * rather than the camelCase convention used elsewhere (e.g. SettingsResource),
 * because AccountsReceivable.jsx's mock data and rendering logic already use
 * snake_case field names directly (r.ar_id, r.customer_id, r.balance, etc.).
 * Matching that here means the existing frontend needs zero changes.
 */
class AccountsReceivableResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'ar_id' => $this->id,
            'customer_id' => $this->customer_id,
            'customer_name' => $this->customer?->customer_name,
            'collector_id' => $this->collector_id,
            'collector_name' => $this->whenLoaded('collector', fn () => $this->collector
                ? trim("{$this->collector->first_name} {$this->collector->last_name}")
                : null),
            'invoice_number' => $this->invoice_number,
            'invoice_date' => $this->invoice_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'original_amount' => (float) $this->original_amount,
            'balance' => (float) $this->remaining_balance,
            'payment_method' => $this->payment_method,
            'payment_terms' => $this->payment_terms,
            'purchase_order_no' => $this->purchase_order_no,
            'reference_no' => $this->reference_no,
            'penalty_rate' => (float) $this->penalty_rate,
            'penalty_amount' => (float) $this->penalty_amount,
            'remarks' => $this->remarks,
            'status' => $this->status,
            'created_by' => $this->created_by,
            'is_archived' => (bool) $this->is_archived,
            'archived_at' => $this->archived_at?->toIso8601String(),
            'archived_by' => $this->archived_by,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}