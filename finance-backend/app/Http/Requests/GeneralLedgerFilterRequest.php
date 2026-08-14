<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GeneralLedgerFilterRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Authenticated read access is enforced by the auth:sanctum route
        // middleware; no per-record ownership check applies to GL lines.
        return true;
    }

    public function rules(): array
    {
        return [
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'reference_type' => ['sometimes', 'nullable', 'string', 'in:Collections,Disbursements,Accounts Receivable,Accounts Payable,Expenses,Tax Obligations'],
            'account_id' => ['sometimes', 'nullable', 'integer', 'exists:chart_of_accounts,id'],
            'date_from' => ['sometimes', 'nullable', 'date'],
            'date_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:date_from'],
            'side' => ['sometimes', 'nullable', 'string', 'in:debit,credit'],
            'per_page' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:200'],
        ];
    }
}