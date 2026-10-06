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
            // Optional. Blank means "mint one for me" — CollectorService
            // resolves it (EmployeeNumber::next(), or the linked login's
            // number) before anything is written, so the admin adding a
            // collector never has to invent or look up a free number.
            'employee_no'      => [
                'nullable',
                'string',
                'max:255',
                // collectors.employee_no is a PARTIAL unique index (see
                // 2026_10_06_020000...): a soft-deleted collector releases
                // its number, so only live rows count here.
                Rule::unique('collectors', 'employee_no')->whereNull('deleted_at'),
                // users.employee_no, by contrast, is a plain unique index —
                // an archived user keeps their number forever. Skipping
                // archived rows in validation would let the insert through
                // and the DB would reject it with an unhandled 500 instead
                // of a form error.
                Rule::unique('users', 'employee_no')->ignore($this->user_id, 'id'),
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
                // users.email is a plain unique index (archived users keep
                // theirs), so this deliberately does NOT ignore deleted_at —
                // the message below is what the admin gets instead of a 500.
                Rule::unique('users', 'email')->ignore($this->user_id, 'id'),
            ],
            'assigned_area'    => ['nullable', 'string', 'max:255'],
            'service_area_id'  => ['nullable', 'integer', 'exists:service_areas,id'],
            'commission_rate'  => ['nullable', 'numeric', 'min:0', 'max:100'],
            'monthly_target'   => ['nullable', 'numeric', 'min:0'],
            'is_active'        => ['sometimes', 'boolean'],
            // Links this collector record to an existing login account.
            'user_id'          => ['nullable', 'integer', 'exists:users,id', Rule::unique('collectors', 'user_id')->whereNull('deleted_at')],
        ];
    }

    public function messages(): array
    {
        return [
            'email.required_without' => 'An email address is required to create the collector user account.',
            'email.unique'           => 'This email address is already in use.',
            'employee_no.unique'     => 'This employee number is already in use.',
        ];
    }
}