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
        $apId = $this->route('accounts_payable')?->id;

        return [
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'invoice_number' => ['required', 'string', 'max:255', Rule::unique('accounts_payable', 'invoice_number')->ignore($apId)],
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