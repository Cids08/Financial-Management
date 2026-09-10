<?php

namespace App\Http\Requests;

use App\Models\Budget;
use Illuminate\Foundation\Http\FormRequest;

class StoreBudgetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Budget::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'department_id' => ['required', 'integer', 'exists:departments,id'],
            'budget_code' => ['nullable', 'string', 'max:50', 'unique:budgets,budget_code'],
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

            // Prevent duplicate budgets of the same type for the same department and fiscal year
            $departmentId = $this->input('department_id');
            $budgetType = $this->input('budget_type');
            if ($departmentId && $fiscalYear && $budgetType) {
                $existing = Budget::query()
                    ->where('department_id', $departmentId)
                    ->where('fiscal_year', (int) $fiscalYear)
                    ->where('budget_type', 'ilike', trim($budgetType))
                    ->whereIn('status', [Budget::STATUS_ACTIVE, Budget::STATUS_DRAFT, Budget::STATUS_CLOSED])
                    ->whereNull('deleted_at')
                    ->first();

                if ($existing) {
                    $validator->errors()->add(
                        'budget_type',
                        "A {$existing->budget_type} budget for this department for fiscal year {$fiscalYear} already exists ({$existing->budget_name} [{$existing->budget_code}] - Status: {$existing->status}). A department can have different budget types (e.g. Operational, Capital, Project), but cannot duplicate the same budget type in the same fiscal year."
                    );
                }
            }

            // Also prevent duplicate budget names for the same fiscal year
            $budgetName = $this->input('budget_name');
            if ($budgetName && $fiscalYear) {
                $nameConflict = Budget::query()
                    ->where('fiscal_year', (int) $fiscalYear)
                    ->where('budget_name', 'ilike', trim($budgetName))
                    ->whereNull('deleted_at')
                    ->first();

                if ($nameConflict) {
                    $validator->errors()->add(
                        'budget_name',
                        "A budget named '{$nameConflict->budget_name}' already exists for fiscal year {$fiscalYear} ({$nameConflict->budget_code}). Budget names must be unique per fiscal year."
                    );
                }
            }
        });
    }
}