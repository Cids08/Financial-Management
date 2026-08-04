<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $customerId = $this->route('customer')?->id;

        return [
            'customer_name' => ['required', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('customers', 'email')->ignore($customerId)->whereNull('deleted_at')],
            'address' => ['nullable', 'string'],
            'tin' => ['nullable', 'string', 'max:255'],
            'credit_limit' => ['sometimes', 'numeric', 'min:0'],
            'status' => ['sometimes', Rule::in(['Active', 'Inactive'])],
        ];
    }
}