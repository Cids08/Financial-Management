<?php

namespace App\Http\Requests;

use App\Models\Budget;
use Illuminate\Foundation\Http\FormRequest;

class StoreBudgetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('create', Budget::class);
    }

    public function rules(): array
    {
        return [
            'department_id' => ['required', 'integer', 'exists:departments,id'],
            'budget_code' => ['required', 'string', 'max:50', 'unique:budgets,budget_code'],
            'budget_name' => ['required', 'string', 'max:255'],
            'budget_type' => ['required', 'string', 'max:100'],
            // Fix: 'min:2000' was a static floor from a quarter-century ago
            // and let a brand-new budget be created for ANY past fiscal
            // year (2020, 2015, whatever) with no relationship to today.
            // The start_date/fiscal_year cross-check in withValidator()
            // below was only ever checking that the two agreed with EACH
            // OTHER — it never stopped both of them from agreeing on a
            // stale year together. Bounding fiscal_year to the current
            // year (plus a small forward window for planning ahead) closes
            // that gap at its actual source instead of patching around it.
            'fiscal_year' => ['required', 'digits:4', 'integer', 'min:'.now()->year, 'max:'.(now()->year + 5)],
            'allocated_amount' => ['required', 'numeric', 'min:0.01'],
            'warning_percentage' => ['nullable', 'numeric', 'min:1', 'max:100'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'remarks' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $fiscalYear = $this->input('fiscal_year');
            $startDate = $this->input('start_date');

            if (! $fiscalYear || ! $startDate) {
                return; // already caught by the required/date rules above
            }

            $startYear = (int) date('Y', strtotime($startDate));

            if ($startYear !== (int) $fiscalYear) {
                $validator->errors()->add(
                    'start_date',
                    "Start date must fall within fiscal year {$fiscalYear}."
                );
            }
        });
    }
}