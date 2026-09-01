<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBudgetRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Fix, matching the same pattern already applied to
        // UploadBudgetPlanRequest::authorize(): dropped
        // $this->user()->can('update', $budget) — a Policy check with no
        // registered BudgetPolicy, which always silently resolved to
        // false for every user. Route middleware (permission:budgets.manage)
        // already enforces the real permission check.
        //
        // Also fixed: was checking status !== 'Approved'. 'Approved' isn't
        // a legal value — budgets_status_check only allows Draft, Active,
        // Closed, Cancelled, and BudgetService::update() itself throws
        // unless status === 'Draft'. This brings the request's own
        // authorization check in line with what the service actually
        // enforces, instead of a check that could never fire.
        $budget = $this->route('budget');

        return $budget->status === 'Draft';
    }

    public function rules(): array
    {
        return [
            // department_id, fiscal_year, and budget_code are intentionally
            // absent — those are locked once a budget exists, same as the
            // frontend form.
            'allocated_amount' => ['required', 'numeric', 'min:0.01'],
            'warning_percentage' => ['nullable', 'numeric', 'min:1', 'max:100'],
            // Fix: start_date had no relationship to the budget's own
            // fiscal_year (fiscal_year isn't editable here, but start_date
            // still needs to stay inside the year the budget was created
            // for — same "start_date=2020 on a fiscal_year=2026 budget"
            // gap StoreBudgetRequest had, just via the route-bound budget's
            // fiscal_year instead of a submitted one).
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'remarks' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $budget = $this->route('budget');
            $startDate = $this->input('start_date');

            if (! $budget || ! $startDate) {
                return; // already caught by the required/date rules above
            }

            $startYear = (int) date('Y', strtotime($startDate));

            if ($startYear !== (int) $budget->fiscal_year) {
                $validator->errors()->add(
                    'start_date',
                    "Start date must fall within fiscal year {$budget->fiscal_year}."
                );
            }
        });
    }
}