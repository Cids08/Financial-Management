<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTaxObligationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'tax_type'          => ['required', Rule::in([
                'VAT', 'Withholding Tax', 'Percentage Tax',
                'Documentary Stamp Tax', 'Income Tax', 'Local Business Tax',
            ])],
            'tax_period'        => ['required', 'string', 'max:255'],
            'due_date'          => ['required', 'date'],
            'tax_rate'          => ['required', 'numeric', 'min:0', 'max:100'],
            'taxable_amount'    => ['required', 'numeric', 'min:0'],
            'is_paid'           => ['sometimes', 'boolean'],
            'payment_date'      => ['required_if:is_paid,true', 'nullable', 'date'],
            'reference_number'  => ['nullable', 'string', 'max:255'],
            'remarks'           => ['nullable', 'string'],
        ];
    }
}