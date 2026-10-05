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
            'department_name' => $this->whenLoaded('department', fn () => $this->department?->department_name),
            'budget_code' => $this->budget_code,
            'budget_name' => $this->budget_name,
            'budget_type' => $this->budget_type,
            'fiscal_year' => $this->fiscal_year,
            'account_allocations' => $this->resource->loadMissing('accountAllocations.account')->accountAllocations->map(fn ($a) => [
                'account_id' => $a->account_id, 'account_code' => $a->account?->account_code,
                'account_name' => $a->account?->account_name, 'allocated_amount' => (float) $a->allocated_amount,
            ]),
            'gl_report' => $this->when($request->boolean('gl_report'), fn () => app(\App\Services\BudgetGlService::class)->summary($this->resource)),
            'allocated_amount' => (float) $this->allocated_amount,
            'used_amount' => (float) $this->used_amount,
            'remaining_amount' => (float) $this->remaining_amount,
            'warning_percentage' => $this->warning_percentage !== null ? (float) $this->warning_percentage : null,
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'status' => $this->status,
            'remarks' => $this->remarks,
            'has_plan' => $this->has_plan,
            'plan_file_name' => $this->has_plan
                ? ($this->supportingDocuments->first()?->original_name ?? null)
                : null,
            'created_by' => $this->created_by,
            'created_by_name' => $this->whenLoaded('creator', fn () => $this->creator ? ($this->creator->fullName() ?: $this->creator->email) : null),
            'approved_by' => $this->approved_by,
            'approved_by_name' => $this->whenLoaded('approver', fn () => $this->approver ? ($this->approver->fullName() ?: $this->approver->email) : null),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}