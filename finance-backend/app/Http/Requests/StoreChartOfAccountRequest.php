<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreChartOfAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'account_code' => [
                'required',
                'string',
                'max:20',
                'regex:/^[A-Za-z0-9][A-Za-z0-9\-_]*$/',
                Rule::unique('chart_of_accounts', 'account_code')->whereNull('deleted_at'),
            ],
            'account_name' => ['required', 'string', 'max:120'],
            'account_type' => ['required', 'string', 'in:Asset,Liability,Equity,Revenue,Expense'],
            'account_category' => ['required', 'string', 'max:80'],
            'parent_account_id' => [
                'nullable',
                'integer',
                Rule::exists('chart_of_accounts', 'id')->whereNull('deleted_at'),
            ],
            'description' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}