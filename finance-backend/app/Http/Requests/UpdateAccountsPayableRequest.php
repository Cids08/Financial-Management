<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAccountsPayableRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Route model binding (SubstituteBindings) runs before FormRequest
        // authorization, so the route parameter is already the resolved
        // AccountsPayable instance here — pass it straight to the policy
        // so per-record rules (e.g. "can't edit an approved bill") apply,
        // not just a blanket "is logged in" check.
        $bill = $this->route('accounts_payable');

        return $this->user() !== null
            && $bill !== null
            && $this->user()->can('update', $bill);
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
            'account_id' => ['required', 'integer', Rule::exists('chart_of_accounts', 'id')],
            'invoice_number' => [
                'required',
                'string',
                'max:255',
                // Exclude the current record so its own invoice_number
                // doesn't trip the uniqueness check on save.
                Rule::unique('accounts_payable', 'invoice_number')->ignore($apId),
            ],
            'invoice_date' => ['nullable', 'date'],
            'due_date' => [
                'required',
                'date',
                function ($attribute, $value, $fail) {
                    if ($this->filled('invoice_date') && strtotime($value) < strtotime($this->input('invoice_date'))) {
                        $fail('The due date must be on or after the invoice date.');
                    }
                },
            ],
            'amount' => [
                'required',
                'numeric',
                'min:0.01',
                function ($attribute, $value, $fail) {
                    // paid_amount isn't editable from this form (no
                    // "record a payment" flow yet — see AccountsPayableService),
                    // so if a new original_amount would leave remaining_balance
                    // negative against what's already been paid, reject it here
                    // rather than silently saving a negative balance.
                    $bill = $this->route('accounts_payable');
                    if ($bill && $value < (float) $bill->paid_amount) {
                        $fail('The amount cannot be less than the amount already paid (' . $bill->paid_amount . ').');
                    }
                },
            ],
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