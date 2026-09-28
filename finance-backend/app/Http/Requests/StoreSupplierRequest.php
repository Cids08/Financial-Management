<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'supplier_name' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:20'],
            'tin' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('suppliers', 'email')->whereNull('deleted_at')],
            'website' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string'],
            'credit_limit' => ['sometimes', 'numeric', 'min:0'],
            'payment_terms' => ['nullable', 'string', 'max:100'],
            'contract_ref' => ['nullable', 'string', 'max:100'],
            'contract_expiry' => ['nullable', 'date'],
            'status' => ['sometimes', Rule::in(['Active', 'Inactive'])],
            'default_withholding_type' => ['nullable', Rule::in(['Goods', 'Services', null])],
        ];
    }
}