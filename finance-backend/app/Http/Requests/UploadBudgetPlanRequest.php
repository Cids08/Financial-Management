<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadBudgetPlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Fix #1: dropped $this->user()->can('update', $budget) — a
        // Laravel Policy check with no registered BudgetPolicy, so it
        // always silently resolved to false ("This action is
        // unauthorized") for every user. Route middleware
        // (permission:budgets.manage) already enforces the real
        // permission check.
        //
        // Fix #2: was checking status !== 'Approved'. 'Approved' isn't a
        // legal value — budgets_status_check only allows Draft, Active,
        // Closed, Cancelled. A plan can only usefully be attached while
        // the budget is still Draft (awaiting approval); once Active it's
        // already approved and locked from editing anyway.
        $budget = $this->route('budget');

        return $budget->status === 'Draft';
    }

    public function rules(): array
    {
        return [
            'plan' => ['required', 'file', 'mimes:pdf,doc,docx,xls,xlsx', 'max:10240'], // 10MB
        ];
    }
}