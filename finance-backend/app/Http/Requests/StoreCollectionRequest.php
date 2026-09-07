<?php

namespace App\Http\Requests;

use App\Models\Collection;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCollectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'ar_id'            => ['required', 'integer', 'exists:accounts_receivable,id'],
            'collector_id'     => ['required', 'integer', 'exists:collectors,id'],
            'cash_account_id'  => ['required', 'integer', 'exists:cash_accounts,id'],
            'receipt_number'   => ['required', 'string', 'max:255', 'unique:collections,receipt_number'],
            'or_number'        => ['nullable', 'string', 'max:255'],
            'collection_date'  => ['required', 'date', 'before_or_equal:today'],
            'deposit_date'     => ['nullable', 'date', 'after_or_equal:collection_date'],
            'amount_received'  => ['required', 'numeric', 'min:0.01'],
            'payment_method'   => ['required', 'string', 'max:255'],
            'reference_number' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('collections', 'reference_number')->whereNull('deleted_at'),
            ],
            'remarks'          => ['nullable', 'string'],

            // Status is optional on create — service forces STATUS_PENDING
            // regardless, but we still validate the value if supplied so
            // a caller can't sneak in an arbitrary string. 'Voided' is
            // intentionally absent: there is no void workflow; use cancel().
            'status' => ['sometimes', 'string', Rule::in([
                Collection::STATUS_PENDING,
                Collection::STATUS_CONFIRMED,
                Collection::STATUS_CANCELLED,
            ])],
        ];
    }
}