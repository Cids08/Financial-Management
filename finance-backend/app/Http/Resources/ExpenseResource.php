<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExpenseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'budget_id' => $this->budget_id,
            'budget_name' => $this->whenLoaded('budget', fn () => $this->budget?->budget_name),
            'expense_category_id' => $this->expense_category_id,
            'expense_category_name' => $this->whenLoaded('category', fn () => $this->category?->category_name),
            'supplier_id' => $this->supplier_id,
            'supplier_name' => $this->whenLoaded('supplier', fn () => $this->supplier?->supplier_name),
            'expense_date' => $this->expense_date?->toDateString(),
            'receipt_number' => $this->receipt_number,
            'expense_amount' => (float) $this->expense_amount,
            'expense_source' => $this->expense_source,
            'receipt_status' => $this->receipt_status,
            'description' => $this->description,
            'is_over_budget' => (bool) $this->is_over_budget,
            'status' => $this->status,
            'created_by' => $this->created_by,
            'created_by_name' => $this->whenLoaded('creator', fn () => $this->creator?->first_name . ' ' . $this->creator?->last_name),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
            'deleted_by' => $this->deleted_by,
            'deleted_by_name' => $this->whenLoaded('deleter', fn () => $this->deleter?->first_name . ' ' . $this->deleter?->last_name),
        ];
    }
}