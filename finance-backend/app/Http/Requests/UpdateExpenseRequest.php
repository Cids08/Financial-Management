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
            'cash_account_id' => ['sometimes', 'required', 'integer', 'exists:cash_accounts,id'],
            'expense_source' => ['nullable', 'string', 'max:50'],
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

            if ($expense && $expense->status !== Expense::STATUS_PENDING) {
                $validator->errors()->add(
                    'status',
                    'Only Pending expenses can be edited. Reject or reverse it first.'
                );
            }

            $budgetId = $this->input('budget_id');
            if ($budgetId) {
                $budget = Budget::find($budgetId);
                if ($budget && $budget->status !== Budget::STATUS_ACTIVE) {
                    $validator->errors()->add(
                        'budget_id',
                        sprintf(
                            'Budget "%s" cannot be charged because its status is "%s". Only Active budgets can be charged for expenses.',
                            $budget->budget_name,
                            $budget->status
                        )
                    );
                }
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

            $cashAccountId = $this->input('cash_account_id', $expense?->cash_account_id);
            $amount = $this->has('expense_amount') ? (float) $this->input('expense_amount') : (float) ($expense?->expense_amount ?? 0);

            if ($cashAccountId && $amount > 0) {
                $cashAccount = \App\Models\CashAccount::find($cashAccountId);

                if ($cashAccount && $amount > (float) $cashAccount->current_balance) {
                    $validator->errors()->add(
                        'expense_amount',
                        'Amount exceeds available funds in the selected cash account.'
                    );
                }
            }
        });
    }
}