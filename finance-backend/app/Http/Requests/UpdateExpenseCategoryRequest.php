<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateExpenseCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $categoryId = $this->route('expenseCategory')?->id;

        return [
            'category_code' => ['sometimes', 'required', 'string', 'max:50', Rule::unique('expense_categories', 'category_code')->ignore($categoryId)],
            'category_name' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('expense_categories', 'category_name')->ignore($categoryId)],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ];
    }
}