<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBudgetRequest extends FormRequest
{
    public function authorize(): bool
    {
        // An approved budget is locked from editing entirely — that decision is
        // final. The route-model-bound $budget is available via route().
        $budget = $this->route('budget');

        return $this->user()->can('update', $budget) && $budget->status !== 'Approved';
    }

    public function rules(): array
    {
        return [
            // department_id, fiscal_year, and budget_code are intentionally absent —
            // those are locked once a budget exists, same as the frontend form.
            'allocated_amount' => ['required', 'numeric', 'min:0.01'],
            'warning_percentage' => ['nullable', 'numeric', 'min:1', 'max:100'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'remarks' => ['nullable', 'string', 'max:2000'],
        ];
    }
}