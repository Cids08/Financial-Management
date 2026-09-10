<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RecordTaxPaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'cash_account_id'  => ['required', 'integer', 'exists:cash_accounts,id'],
            'payment_date'     => ['required', 'date'],
            'reference_number' => ['required', 'string', 'max:100'],
            'remarks'          => ['nullable', 'string', 'max:500'],
            'document'         => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];
    }

    public function messages(): array
    {
        return [
            'cash_account_id.required'  => 'Please select the bank or cash account from which this tax payment was made.',
            'cash_account_id.exists'    => 'The selected cash account is invalid.',
            'payment_date.required'     => 'Payment date is required.',
            'reference_number.required' => 'BIR reference / payment confirmation number is required.',
            'document.required'         => 'Official proof of payment (BIR confirmation or bank slip) is required.',
            'document.mimes'            => 'Proof of payment must be a PDF or image file (PDF, JPG, PNG).',
            'document.max'              => 'Proof of payment file cannot exceed 10MB.',
        ];
    }
}
