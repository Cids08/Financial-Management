<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCollectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'ar_id' => ['required', 'integer', 'exists:accounts_receivable,id'],
            'collector_id' => ['required', 'integer', 'exists:collectors,id'],
            'cash_account_id' => ['required', 'integer', 'exists:cash_accounts,id'],
            'receipt_number' => ['required', 'string', 'max:255', 'unique:collections,receipt_number'],
            'or_number' => ['nullable', 'string', 'max:255'],
            'collection_date' => ['required', 'date'],
            'deposit_date' => ['nullable', 'date', 'after_or_equal:collection_date'],
            'amount_received' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', 'string', 'max:255'],
            'reference_number' => ['nullable', 'string', 'max:255'],
            'remarks' => ['nullable', 'string'],
        ];
    }
}