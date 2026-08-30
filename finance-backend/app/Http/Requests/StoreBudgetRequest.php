<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreBudgetRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Route middleware (permission:budgets.manage) already enforces
        // the real permission check — see earlier fix.
        return true;
    }

    public function rules(): array
    {
        return [
            'department_id' => ['required', 'integer', 'exists:departments,id'],
            'budget_code' => ['required', 'string', 'max:50', 'unique:budgets,budget_code'],
            'budget_name' => ['required', 'string', 'max:255'],
            // No longer restricted to Rule::in(). The frontend now offers
            // 'Other' with a free-text "please specify" field, and sends
            // whatever was typed as budget_type directly — a fixed enum
            // here would reject exactly the values that flow is meant to
            // allow. Length-capped instead of open-ended.
            'budget_type' => ['required', 'string', 'max:100'],
            'fiscal_year' => ['required', 'digits:4', 'integer', 'min:2000'],
            'allocated_amount' => ['required', 'numeric', 'min:0.01'],
            'warning_percentage' => ['nullable', 'numeric', 'min:1', 'max:100'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'remarks' => ['nullable', 'string', 'max:2000'],
        ];
    }
}