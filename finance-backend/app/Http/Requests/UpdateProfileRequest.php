<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Every authenticated user may edit their own profile.
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $userId = $this->user()->id;

        return [
            'first_name'   => ['required', 'string', 'max:255'],
            'middle_name'  => ['nullable', 'string', 'max:255'],
            'last_name'    => ['required', 'string', 'max:255'],
            'suffix'       => ['nullable', 'string', 'max:255'],
            'email'        => [
                'required', 'email', 'max:255',
                Rule::unique('users', 'email')->ignore($userId),
            ],
            'phone_number' => ['nullable', 'string', 'max:20'],
            // role_id / department_id / title_id are intentionally NOT
            // accepted here — role assignment is an admin-only action
            // (see RoleController / UserManagementController), matching
            // the disabled "Role" field in the Profile frontend.
        ];
    }

    public function messages(): array
    {
        return [
            'email.unique' => 'This email address is already in use by another account.',
        ];
    }
}