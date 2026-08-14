<?php

namespace App\Http\Requests;

use App\Models\Expense;
use Illuminate\Foundation\Http\FormRequest;

class StoreExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Swap for a Policy/Gate check once expense permissions are wired up,
        // e.g. return $this->user()->can('create', Expense::class);
        return $this->user() !== null;
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
            'expense_source' => ['required', 'string', 'max:100'],
            'receipt_status' => ['nullable', 'in:' . implode(',', [
                Expense::RECEIPT_PENDING,
                Expense::RECEIPT_VERIFIED,
                Expense::RECEIPT_REJECTED,
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
}