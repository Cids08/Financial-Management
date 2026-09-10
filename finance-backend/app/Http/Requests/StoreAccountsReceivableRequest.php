<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAccountsReceivableRequest extends FormRequest
{
    /**
     * Keep in sync with the `status` values your frontend offers.
     * DB default is 'Pending' — adjust this list if your actual
     * business statuses differ.
     */
    protected const STATUSES = ['Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];

    protected const PAYMENT_METHODS = ['Bank Transfer', 'Check', 'Cash', 'Credit Card', 'GCash'];

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'collector_id' => ['nullable', 'integer', 'exists:collectors,id'],
            'invoice_number' => ['required', 'string', 'max:255', 'unique:accounts_receivable,invoice_number'],
            'invoice_date' => ['required', 'date'],
            'due_date' => ['required', 'date', 'after_or_equal:invoice_date'],
            'original_amount' => ['required', 'numeric', 'min:0'],
            'balance' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', Rule::in(self::PAYMENT_METHODS)],
            'payment_terms' => ['nullable', 'string', 'max:255'],
            'purchase_order_no' => ['nullable', 'string', 'max:255'],
            'reference_no' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('accounts_receivable', 'reference_no')->whereNull('deleted_at'),
            ],
            'penalty_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'remarks' => ['nullable', 'string'],
            'status' => ['required', 'string', Rule::in(self::STATUSES)],
            'document' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:10240'],
        ];
    }

    public function messages(): array
    {
        return [
            'document.required' => 'A supporting document (signed invoice or delivery receipt scan/PDF) is strictly required to create an invoice.',
            'document.file' => 'The supporting document must be a valid file.',
            'document.mimes' => 'The supporting document must be a file of type: pdf, jpg, jpeg, png, webp.',
            'document.max' => 'The supporting document cannot exceed 10MB in size.',
        ];
    }
}