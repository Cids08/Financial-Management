<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class VerifyTwoFactorRequest extends FormRequest
{
    /**
     * Settings > Enable Two-Factor Authentication confirm step. Sits
     * behind auth:sanctum — a real user is already resolved here, so no
     * pendingToken exists or is needed for this flow. This is a distinct
     * endpoint from the login-time verify step (LoginVerifyTwoFactorRequest),
     * which does require pendingToken — don't merge the two back together.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return ['code' => ['required', 'digits:6']];
    }
}