<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BudgetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'budget_id' => $this->id,
            'department_id' => $this->department_id,
            'department_name' => $this->whenLoaded('department', fn () => $this->department->department_name),
            'budget_code' => $this->budget_code,
            'budget_name' => $this->budget_name,
            'budget_type' => $this->budget_type,
            'fiscal_year' => $this->fiscal_year,
            'allocated_amount' => (float) $this->allocated_amount,
            'used_amount' => (float) $this->used_amount,
            'remaining_amount' => (float) $this->remaining_amount,
            'warning_percentage' => $this->warning_percentage !== null ? (float) $this->warning_percentage : null,
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'status' => $this->status,
            'approval_status' => $this->approval_status,
            'remarks' => $this->remarks,
            // This is what the frontend's hasBudgetPlan(b) reads — see Budgets.jsx.
            'has_plan' => $this->has_plan,
            'created_by' => $this->created_by,
            'created_by_name' => $this->whenLoaded('creator', fn () => $this->creator?->first_name.' '.$this->creator?->last_name),
            'approved_by' => $this->approved_by,
            'approved_by_name' => $this->whenLoaded('approver', fn () => $this->approver?->first_name.' '.$this->approver?->last_name),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}