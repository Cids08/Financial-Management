<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCashAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $accountId = $this->route('cashAccount')?->id;

        return [
            'account_name'    => ['required', 'string', 'max:255'],
            'bank_name'       => ['nullable', 'string', 'max:255'],
            'account_number'  => ['required', 'string', 'max:255', Rule::unique('cash_accounts', 'account_number')->ignore($accountId)],
            'account_type'    => ['required', Rule::in(['Checking', 'Savings', 'Petty Cash', 'Money Market'])],
            // current_balance is derived from postings, never typed. Rejecting
            // it outright (rather than quietly dropping it) means an API client
            // gets a clear 422 instead of believing it changed something.
            // The opening balance is set once, at creation.
            'current_balance' => ['prohibited'],
            'opening_balance'  => ['prohibited'],
            'status'          => ['sometimes', Rule::in(['Active', 'Inactive'])],

            'branch_name' => ['nullable', 'string', 'max:255'],
            'swift_code'  => ['nullable', 'string', 'max:255'],
            'currency'    => ['nullable', 'string', 'size:3'],
            'is_default'  => ['sometimes', 'boolean'],
        ];
    }
}