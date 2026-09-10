<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GenerateTaxScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'year'                         => ['required', 'integer', 'min:2020', 'max:2035'],
            'period_scope'                 => ['required', 'string', 'in:full_year,q1,q2,q3,q4'],
            'tax_types'                    => ['required', 'array', 'min:1'],
            'tax_types.*'                  => ['required', 'string', 'in:VAT,Withholding Tax,Percentage Tax,Documentary Stamp Tax,Income Tax,Local Business Tax'],
            'auto_calculate_past'          => ['nullable', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'year.required'         => 'Fiscal year is required.',
            'year.integer'          => 'Fiscal year must be a valid integer year.',
            'period_scope.required' => 'Period scope is required (e.g. full_year, q1, q2, q3, or q4).',
            'tax_types.required'    => 'Please select at least one tax type to schedule.',
            'tax_types.min'         => 'Please select at least one tax type to schedule.',
            'tax_types.*.in'        => 'One or more selected tax types are invalid.',
        ];
    }
}

