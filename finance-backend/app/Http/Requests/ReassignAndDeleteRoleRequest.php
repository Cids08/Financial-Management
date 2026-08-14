<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReassignAndDeleteRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // Further checks (not-same-role, Super Admin reassignment
            // authorization) happen in RoleService::reassignAndDelete() —
            // this layer only validates that the target role plausibly
            // exists at all.
            'target_role_id' => ['required', 'integer', 'exists:roles,id'],
        ];
    }
}