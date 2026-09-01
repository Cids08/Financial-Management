<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAccountsPayableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        // Route model binding has already resolved this to the actual
        // AccountsPayable instance by the time rules() runs (SubstituteBindings
        // middleware runs before FormRequest validation), so ?->id is the
        // real primary key of the record being edited — not the route string.
        $apId = $this->route('accounts_payable')?->id;

        return [
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'invoice_number' => [
                'required',
                'string',
                'max:255',
                // Exclude the current record so its own invoice_number
                // doesn't trip the uniqueness check on save.
                Rule::unique('accounts_payable', 'invoice_number')->ignore($apId),
            ],
            'invoice_date' => ['nullable', 'date'],
            'due_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:255'],
            'billing_address' => ['nullable', 'string', 'max:1000'],
            'description' => ['nullable', 'string', 'max:1000'],
            'reference_number' => ['nullable', 'string', 'max:255'],
            'purchase_order_no' => ['nullable', 'string', 'max:255'],
            'has_attachment' => ['nullable', 'boolean'],
            // See StoreAccountsPayableRequest — status constraint unconfirmed.
            'status' => ['nullable', 'string', 'max:255'],
        ];
    }
}