<?php

namespace App\Http\Requests;

use App\Models\Budget;
use App\Models\CashAccount;
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
            'expense_amount' => ['required', 'numeric', 'min:' . config('business.min_collection_amount')],
            'cash_account_id' => ['required', 'integer', 'exists:cash_accounts,id'],
            'expense_source' => ['nullable', 'string', 'max:50'],
            'receipt_status' => ['nullable', 'in:' . implode(',', [
                Expense::RECEIPT_PENDING,
                Expense::RECEIPT_UPLOADED,
                Expense::RECEIPT_MISSING,
            ])],
            'description' => ['required', 'string'],
            'receipt' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:10240'],
        ];
    }

    public function messages(): array
    {
        return [
            'budget_id.exists' => 'Selected budget does not exist.',
            'expense_category_id.exists' => 'Selected expense category does not exist.',
            'supplier_id.exists' => 'Selected supplier does not exist.',
            'expense_amount.min' => 'Expense amount must be greater than zero.',
            'cash_account_id.required' => 'Please select a cash account for this expense.',
            'cash_account_id.exists' => 'Selected cash account does not exist.',
            'receipt.required' => 'A receipt document (official receipt scan or PDF) is strictly required to record an expense.',
            'receipt.file' => 'The receipt must be a valid file.',
            'receipt.mimes' => 'The receipt must be a file of type: pdf, jpg, jpeg, png, webp.',
            'receipt.max' => 'The receipt cannot exceed 10MB in size.',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('supplier_id')) {
            $val = $this->input('supplier_id');
            if ($val === '' || $val === 'null' || $val === 'NaN' || strtolower(trim((string) $val)) === 'n/a' || $val === '0' || $val === 0) {
                $this->merge(['supplier_id' => null]);
            }
        }

        $source = $this->input('expense_source');
        $validSources = [Expense::SOURCE_CASH, Expense::SOURCE_BANK, Expense::SOURCE_PETTY_CASH];
        if (! in_array($source, $validSources, true)) {
            $cashAccountId = $this->input('cash_account_id');
            $cashAcc = $cashAccountId ? CashAccount::find($cashAccountId) : null;
            if ($cashAcc) {
                $type = strtolower($cashAcc->account_type ?? '');
                if (str_contains($type, 'petty')) {
                    $source = Expense::SOURCE_PETTY_CASH;
                } elseif ($type === 'cash' || (empty($cashAcc->bank_name) && ! str_contains($type, 'bank'))) {
                    $source = Expense::SOURCE_CASH;
                } else {
                    $source = Expense::SOURCE_BANK;
                }
            } else {
                $source = Expense::SOURCE_CASH;
            }
            $this->merge(['expense_source' => $source]);
        }
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
     * approval time (see ExpenseController::approve()'s $isAdminOverride).
     * Users without an assigned department (e.g. general accounting staff)
     * are not blocked from recording expenses.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $budgetId = $this->input('budget_id');
            $user = $this->user();
            $isAdminOverride = $user?->hasAnyRole(['super-admin', 'admin', 'Super Admin', 'Admin']) ?? false;

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

                if ($budget && $user && ! $isAdminOverride && ! empty($user->department_id) && ! empty($budget->department_id) && $budget->department_id !== $user->department_id) {
                    $budgetDept = Department::find($budget->department_id)?->department_name ?? 'another department';
                    $userDept = Department::find($user->department_id)?->department_name ?? 'your department';

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

            $cashAccountId = $this->input('cash_account_id');
            $amount = (float) $this->input('expense_amount', 0);

            if ($cashAccountId && $amount > 0) {
                $cashAccount = CashAccount::find($cashAccountId);

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