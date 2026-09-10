<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ExecuteDepreciationRunRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null && $this->user()->hasPermission('fixed-assets.manage');
    }


    public function rules(): array
    {
        return [
            'fiscal_year' => ['required', 'integer', 'min:2000', 'max:2099'],
            'period'      => ['required', 'in:monthly,annual'],
            'month'       => ['required_if:period,monthly', 'nullable', 'integer', 'min:1', 'max:12'],
            'posting_date' => ['required', 'date'],
            'remarks'     => ['nullable', 'string', 'max:500'],
            'asset_ids'   => ['nullable', 'array'],
            'asset_ids.*' => ['integer', 'exists:fixed_assets,id'],
        ];
    }
}

