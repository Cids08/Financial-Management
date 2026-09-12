<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCashAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'account_name'    => ['required', 'string', 'max:255'],
            'bank_name'       => ['nullable', 'string', 'max:255'],
            'account_number'  => ['required', 'string', 'max:255', 'unique:cash_accounts,account_number'],
            'account_type'    => ['required', Rule::in(['Checking', 'Savings', 'Petty Cash', 'Money Market'])],
            'current_balance' => ['nullable', 'numeric', 'min:0'],
            'status'          => ['sometimes', Rule::in(['Active', 'Inactive'])],

            // Not in the current frontend form yet, but part of the ERD —
            // accepted if sent, safely defaulted in the service if not.
            'branch_name' => ['nullable', 'string', 'max:255'],
            'swift_code'  => ['nullable', 'string', 'max:255'],
            'currency'    => ['nullable', 'string', 'size:3'],
            'is_default'  => ['sometimes', 'boolean'],
        ];
    }
}