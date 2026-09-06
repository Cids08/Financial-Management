<?php

namespace App\Http\Requests;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class UpdateExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('expense')) ?? false;
    }

    public function rules(): array
    {
        return [
            'budget_id' => ['sometimes', 'required', 'integer', 'exists:budgets,id'],
            'expense_category_id' => ['sometimes', 'required', 'integer', 'exists:expense_categories,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'expense_date' => ['sometimes', 'required', 'date'],
            'receipt_number' => ['nullable', 'string', 'max:100'],
            'expense_amount' => ['sometimes', 'required', 'numeric', 'min:0.01'],
            'expense_source' => ['sometimes', 'required', 'string', 'max:100'],
            'receipt_status' => ['nullable', 'in:' . implode(',', [
                Expense::RECEIPT_PENDING,
                Expense::RECEIPT_UPLOADED,
                Expense::RECEIPT_MISSING,
            ])],
            'description' => ['sometimes', 'required', 'string'],
        ];
    }

    /**
     * Once an expense is Approved it has already hit the budget and the
     * general ledger — editing it in place would silently desync both.
     * Rejecting or reversing it is a separate, deliberate workflow.
     *
     * This is now also enforced in ExpensePolicy::update() (checked via
     * authorize() above, before rules() even runs) — kept here too as a
     * belt-and-suspenders validation-layer message, same as
     * ExpenseService::update()'s own guard.
     *
     * Inactive-category check only fires when expense_category_id is
     * actually CHANGING to a different value. An expense that already
     * has a since-retired category assigned must stay editable for every
     * other field (amount, description, etc.) without being forced to
     * first pick a different category — the block is on choosing an
     * inactive category, not on merely having one from before it was
     * retired.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            /** @var Expense|null $expense */
            $expense = $this->route('expense');

            if ($expense && $expense->status === Expense::STATUS_APPROVED) {
                $validator->errors()->add(
                    'status',
                    'Approved expenses cannot be edited directly. Reject or reverse it first.'
                );
            }

            $categoryId = $this->input('expense_category_id');

            if ($expense && $categoryId && (int) $categoryId !== (int) $expense->expense_category_id) {
                $category = ExpenseCategory::find($categoryId);

                if ($category && ! $category->is_active) {
                    $validator->errors()->add(
                        'expense_category_id',
                        'This expense category is inactive and can no longer be selected.'
                    );
                }
            }
        });
    }
}