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
            'budget_remaining_amount' => $this->whenLoaded('budget', fn () => $this->budget ? (float) $this->budget->remaining_amount : null),
            'budget_allocated_amount' => $this->whenLoaded('budget', fn () => $this->budget ? (float) $this->budget->allocated_amount : null),
            'expense_category_id' => $this->expense_category_id,
            'expense_category_name' => $this->whenLoaded('category', fn () => $this->category?->category_name),
            'supplier_id' => $this->supplier_id,
            'supplier_name' => $this->whenLoaded('supplier', fn () => $this->supplier?->supplier_name),
            'expense_date' => $this->expense_date?->toDateString(),
            'receipt_number' => $this->receipt_number,
            'expense_amount' => (float) $this->expense_amount,
            'expense_source' => $this->expense_source,
            'cash_account_id' => $this->cash_account_id,
            'cash_account_name' => $this->whenLoaded('cashAccount', fn () => $this->cashAccount?->account_name),
            'cash_account_code' => $this->whenLoaded('cashAccount', fn () => $this->cashAccount?->account_code),
            'cash_account_bank' => $this->whenLoaded('cashAccount', fn () => $this->cashAccount?->bank_name),
            'receipt_status' => $this->receipt_status,
            'description' => $this->description,
            'is_over_budget' => (bool) $this->is_over_budget,
            'status' => $this->status,
            'rejection_remarks' => $this->rejection_remarks,
            'has_receipt' => $this->has_receipt,
            'created_by' => $this->created_by,
            'created_by_name' => $this->whenLoaded('creator', fn () => $this->creator?->first_name . ' ' . $this->creator?->last_name),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'approved_by' => $this->approved_by,
            'approved_by_name' => $this->whenLoaded('approver', fn () => $this->approver ? trim($this->approver->first_name . ' ' . $this->approver->last_name) : null),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'rejected_by' => $this->rejected_by,
            'rejected_by_name' => $this->whenLoaded('rejector', fn () => $this->rejector ? trim($this->rejector->first_name . ' ' . $this->rejector->last_name) : null),
            'rejected_at' => $this->rejected_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
            'deleted_by' => $this->deleted_by,
            'deleted_by_name' => $this->whenLoaded('deleter', fn () => $this->deleter?->first_name . ' ' . $this->deleter?->last_name),
            // Only present on the detail view (ExpenseController::show()),
            // which eager-loads it. Left out of the index/list response on
            // purpose so listing 15-50 expenses doesn't pull in every
            // linked tax obligation for every row.
            'tax_obligations' => TaxObligationResource::collection($this->whenLoaded('taxObligations')),
        ];
    }
}