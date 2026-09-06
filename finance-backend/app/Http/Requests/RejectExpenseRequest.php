<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RejectExpenseRequest extends FormRequest
{
    /**
     * Rejecting is a distinct ability (ExpensePolicy::reject(), tied to
     * expenses.approve) from editing an expense's own fields
     * (ExpensePolicy::update(), tied to expenses.manage) — a Staff user
     * with expenses.manage but not expenses.approve must not be able to
     * reject.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('reject', $this->route('expense')) ?? false;
    }

    public function rules(): array
    {
        return [
            'remarks' => ['nullable', 'string', 'max:500'],
        ];
    }
}