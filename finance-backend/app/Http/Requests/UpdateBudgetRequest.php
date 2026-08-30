<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBudgetRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Was checking status !== 'Approved' — 'Approved' isn't a legal
        // value (see budgets_status_check: Draft/Active/Closed/Cancelled),
        // so this could never actually block anything. Editable only while
        // Draft is the real intended rule.
        $budget = $this->route('budget');

        return $budget->status === 'Draft';
    }

    public function rules(): array
    {
        return [
            'allocated_amount' => ['required', 'numeric', 'min:0.01'],
            'warning_percentage' => ['nullable', 'numeric', 'min:1', 'max:100'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'remarks' => ['nullable', 'string', 'max:2000'],
        ];
    }
}