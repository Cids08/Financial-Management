<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class BatchApproveExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        return $user !== null && (
            $user->hasPermission('expenses.approve') ||
            $user->hasAnyRole(['admin', 'super-admin'])
        );
    }

    public function rules(): array
    {
        return [
            'expense_ids'   => ['required', 'array', 'min:1'],
            'expense_ids.*' => ['required', 'integer', 'exists:expenses,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'expense_ids.required' => 'Please select at least one expense to approve and pay.',
            'expense_ids.min'      => 'Please select at least one expense to approve and pay.',
            'expense_ids.*.exists' => 'One or more selected expenses do not exist.',
        ];
    }
}

