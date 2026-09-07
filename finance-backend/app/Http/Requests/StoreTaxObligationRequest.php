<?php

namespace App\Http\Requests;

use App\Models\TaxObligation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTaxObligationRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Previously just checked the user was authenticated, which meant
        // any logged-in user — regardless of role — could create a tax
        // obligation. Route through a Policy so this respects role-based
        // permissions like every other financial-write endpoint.
        return $this->user()?->can('create', TaxObligation::class) ?? false;
    }

    public function rules(): array
    {
        $id = $this->route('taxObligation')?->id;

        return [
            'tax_type'   => ['required', Rule::in([
                'VAT', 'Withholding Tax', 'Percentage Tax',
                'Documentary Stamp Tax', 'Income Tax', 'Local Business Tax',
            ])],
            // tax_period/due_date are computed client-side from tax_type +
            // period (see TAX_TYPE_CONFIG in TaxObligations.jsx) and sent
            // as-is — due_date stays editable there for BIR extensions.
            'tax_period'        => ['required', 'string', 'max:255'],
            'due_date'          => ['required', 'date'],
            'tax_rate'          => ['required', 'numeric', 'min:0', 'max:100'],
            'taxable_amount'    => ['required', 'numeric', 'min:0'],
            'is_paid'           => ['sometimes', 'boolean'],
            'payment_date'      => ['required_if:is_paid,true', 'nullable', 'date'],
            'reference_number'  => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('tax_obligations', 'reference_number')
                    ->ignore($id)
                    ->whereNull('deleted_at'),
            ],
            'remarks'           => ['nullable', 'string'],
        ];
    }
}