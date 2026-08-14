<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreExpenseCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'category_code' => ['required', 'string', 'max:50', 'unique:expense_categories,category_code'],
            'category_name' => ['required', 'string', 'max:255', 'unique:expense_categories,category_name'],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ];
    }
}