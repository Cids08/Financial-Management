<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCollectorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'employee_no'      => ['required', 'string', 'max:255', 'unique:collectors,employee_no'],
            'first_name'       => ['required', 'string', 'max:255'],
            'middle_name'      => ['nullable', 'string', 'max:255'],
            'last_name'        => ['required', 'string', 'max:255'],
            'phone_number'     => ['nullable', 'string', 'max:20'],
            'email'            => ['nullable', 'email', 'max:255'],
            'assigned_area'    => ['nullable', 'string', 'max:255'],
            'service_area_id'  => ['nullable', 'integer', 'exists:service_areas,id'],
            'commission_rate'  => ['nullable', 'numeric', 'min:0', 'max:100'],
            'monthly_target'   => ['nullable', 'numeric', 'min:0'],
            'is_active'        => ['sometimes', 'boolean'],
        ];
    }
}