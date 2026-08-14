<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreFixedAssetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'asset_code'          => ['required', 'string', 'max:255', 'unique:fixed_assets,asset_code'],
            'asset_name'          => ['required', 'string', 'max:255'],
            'asset_category'      => ['required', 'string', 'max:255'],
            'department_id'       => ['nullable', 'integer', 'exists:departments,id'],
            'serial_number'       => ['nullable', 'string', 'max:255'],
            'brand'               => ['nullable', 'string', 'max:255'],
            'model'               => ['nullable', 'string', 'max:255'],
            'location'            => ['nullable', 'string', 'max:255'],
            'purchase_date'       => ['required', 'date'],
            'purchase_cost'       => ['required', 'numeric', 'min:0'],
            'salvage_value'       => ['nullable', 'numeric', 'min:0'],
            'useful_life_years'   => ['required', 'integer', 'min:1'],
            'depreciation_method' => ['nullable', Rule::in(['Straight Line'])], // only method currently supported
            'status'              => ['sometimes', Rule::in(['Active', 'Under Maintenance', 'Disposed'])],
            'remarks'             => ['nullable', 'string'],
        ];
    }
}