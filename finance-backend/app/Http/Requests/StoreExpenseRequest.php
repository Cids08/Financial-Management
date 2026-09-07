<?php

namespace App\Http\Requests;

use App\Models\Budget;
use App\Models\Department;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class StoreExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Expense::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'budget_id' => ['required', 'integer', 'exists:budgets,id'],
            'expense_category_id' => ['required', 'integer', 'exists:expense_categories,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'expense_date' => ['required', 'date'],
            'receipt_number' => ['nullable', 'string', 'max:100'],
            'expense_amount' => ['required', 'numeric', 'min:0.01'],
            'expense_source' => ['required', 'string', 'in:' . implode(',', [
                Expense::SOURCE_CASH,
                Expense::SOURCE_BANK,
                Expense::SOURCE_PETTY_CASH,
            ])],
            'receipt_status' => ['nullable', 'in:' . implode(',', [
                Expense::RECEIPT_PENDING,
                Expense::RECEIPT_UPLOADED,
                Expense::RECEIPT_MISSING,
            ])],
            'description' => ['required', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'budget_id.exists' => 'Selected budget does not exist.',
            'expense_category_id.exists' => 'Selected expense category does not exist.',
            'supplier_id.exists' => 'Selected supplier does not exist.',
            'expense_amount.min' => 'Expense amount must be greater than zero.',
        ];
    }

    /**
     * A budget belongs to a department. An expense should only ever be
     * filed against — and later draw down — the budget of the department
     * the filer belongs to, never another department's. This is checked
     * again in ExpenseService::approve() (the point that actually moves
     * budget numbers), since that check can't be skipped just because
     * this one already ran — but catching it here means a mismatched
     * expense never even makes it to Pending.
     *
     * Super Admin/Admin bypass this the same way they bypass it at
     * approval time (see ExpenseController::approve()'s $isAdminOverride)
     * — same rule, same reasoning, just enforced at the other end of the
     * expense's lifecycle. A non-admin filer with no department assigned
     * (or a real cross-department mismatch) still gets blocked here.
     *
     * A category being Inactive is checked the same way, for the same
     * reason: the frontend dropdown already filters to active categories
     * only, but that's a UI convenience, not enforcement — someone could
     * still submit a since-retired category_id directly.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $budgetId = $this->input('budget_id');
            $user = $this->user();
            $isAdminOverride = $user?->hasAnyRole(['super-admin', 'admin']) ?? false;

            if ($budgetId && ! $isAdminOverride) {
                $budget = Budget::find($budgetId);

                if ($budget && $user && $budget->department_id !== $user->department_id) {
                    $budgetDept = Department::find($budget->department_id)?->department_name ?? 'an unassigned department';
                    $userDept = Department::find($user->department_id)?->department_name ?? 'no department';

                    $validator->errors()->add(
                        'budget_id',
                        sprintf(
                            'Budget "%s" belongs to %s, but you are assigned to %s. You can only file expenses against your own department\'s budget.',
                            $budget->budget_name,
                            $budgetDept,
                            $userDept
                        )
                    );
                }
            }

            $categoryId = $this->input('expense_category_id');

            if ($categoryId) {
                $category = ExpenseCategory::find($categoryId);

                if ($category && ! $category->is_active) {
                    $validator->errors()->add(
                        'expense_category_id',
                        'This expense category is inactive and can no longer be used for new expenses.'
                    );
                }
            }
        });
    }
}