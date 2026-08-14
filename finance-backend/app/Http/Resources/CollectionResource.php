<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CollectionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'ar_id' => $this->ar_id,
            'invoice_number' => $this->whenLoaded('accountsReceivable', fn () => $this->accountsReceivable?->invoice_number),
            'collector_id' => $this->collector_id,
            'collector_name' => $this->whenLoaded('collector', fn () => trim("{$this->collector?->first_name} {$this->collector?->last_name}")),
            'cash_account_id' => $this->cash_account_id,
            'cash_account_name' => $this->whenLoaded('cashAccount', fn () => $this->cashAccount?->account_name),
            'receipt_number' => $this->receipt_number,
            'or_number' => $this->or_number,
            'collection_date' => $this->collection_date?->toDateString(),
            'deposit_date' => $this->deposit_date?->toDateString(),
            'amount_received' => (float) $this->amount_received,
            'payment_method' => $this->payment_method,
            'reference_number' => $this->reference_number,
            'status' => $this->status,
            'received_by' => $this->received_by,
            'received_by_name' => $this->whenLoaded('receiver', fn () => $this->receiver ? trim("{$this->receiver->first_name} {$this->receiver->last_name}") : null),
            'remarks' => $this->remarks,
            'created_by' => $this->created_by,
            'created_by_name' => $this->whenLoaded('creator', fn () => trim("{$this->creator?->first_name} {$this->creator?->last_name}")),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
        ];
    }
}