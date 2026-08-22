<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreDisbursementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // disbursements.manage already enforced by route middleware
    }

    public function rules(): array
    {
        return [
            'ap_id' => ['required', 'integer', 'exists:accounts_payable,id'],
            'department_id' => ['required', 'integer', 'exists:departments,id'],
            'cash_account_id' => ['required', 'integer', 'exists:cash_accounts,id'],
            'voucher_number' => ['required', 'string', 'max:50', 'unique:disbursements,voucher_number'],
            'payee' => ['required', 'string', 'max:255'],
            'payment_date' => ['required', 'date'],
            'amount_paid' => ['required', 'numeric', 'min:0.01'],
            'currency' => ['required', 'string', 'max:10'],
            'payment_method' => ['required', 'string', 'max:50'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'remarks' => ['nullable', 'string', 'max:2000'],
        ];
    }
}