<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadBudgetPlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        $budget = $this->route('budget');

        return $this->user()->can('update', $budget) && $budget->status !== 'Approved';
    }

    public function rules(): array
    {
        return [
            'plan' => ['required', 'file', 'mimes:pdf,doc,docx,xls,xlsx', 'max:10240'], // 10MB
        ];
    }
}