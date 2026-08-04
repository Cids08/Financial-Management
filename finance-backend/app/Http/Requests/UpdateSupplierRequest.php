<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $supplierId = $this->route('supplier')?->id;

        return [
            'supplier_name' => ['required', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('suppliers', 'email')->ignore($supplierId)->whereNull('deleted_at')],
            'website' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string'],
            'tin' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::in(['Active', 'Inactive'])],
        ];
    }
}