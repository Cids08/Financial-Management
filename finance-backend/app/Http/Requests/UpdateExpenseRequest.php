<?php

namespace App\Http\Requests;

use App\Models\Expense;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class UpdateExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
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
                Expense::RECEIPT_VERIFIED,
                Expense::RECEIPT_REJECTED,
            ])],
            'description' => ['sometimes', 'required', 'string'],
        ];
    }

    /**
     * Once an expense is Approved it has already hit the budget and the
     * general ledger — editing it in place would silently desync both.
     * Rejecting or reversing it is a separate, deliberate workflow.
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
        });
    }
}