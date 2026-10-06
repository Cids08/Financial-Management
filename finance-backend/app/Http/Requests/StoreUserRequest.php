<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'role_id' => ['required', 'integer', Rule::exists('roles', 'id')],
            'title_id' => ['nullable', 'integer', Rule::exists('titles', 'id')],
            'status' => ['required', 'string', Rule::in(['Active', 'Inactive'])],
        ];
    }

    /**
     * users.email is a plain unique index (archived users keep theirs, so a
     * login address is never handed to a second account) — say that plainly
     * instead of Laravel's generic "already been taken".
     */
    public function messages(): array
    {
        return [
            'email.unique' => 'This email address is already in use.',
        ];
    }
}