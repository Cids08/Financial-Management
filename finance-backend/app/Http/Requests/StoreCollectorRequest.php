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
            'employee_no'      => [
                'required',
                'string',
                'max:255',
                'unique:collectors,employee_no',
                Rule::unique('users', 'employee_no')->whereNull('deleted_at')->ignore($this->user_id, 'id'),
            ],
            'first_name'       => ['required', 'string', 'max:255'],
            'middle_name'      => ['nullable', 'string', 'max:255'],
            'last_name'        => ['required', 'string', 'max:255'],
            'phone_number'     => ['nullable', 'string', 'max:20'],
            'email'            => [
                'required_without:user_id',
                'nullable',
                'email',
                'max:255',
                Rule::unique('users', 'email')->whereNull('deleted_at')->ignore($this->user_id, 'id'),
            ],
            'assigned_area'    => ['nullable', 'string', 'max:255'],
            'service_area_id'  => ['nullable', 'integer', 'exists:service_areas,id'],
            'commission_rate'  => ['nullable', 'numeric', 'min:0', 'max:100'],
            'monthly_target'   => ['nullable', 'numeric', 'min:0'],
            'is_active'        => ['sometimes', 'boolean'],
            // Links this collector record to an existing login account.
            'user_id'          => ['nullable', 'integer', 'exists:users,id', 'unique:collectors,user_id'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.required_without' => 'An email address is required to create the collector user account.',
            'email.unique'           => 'This email address is already registered to an existing user.',
            'employee_no.unique'     => 'This employee number is already taken.',
        ];
    }
}