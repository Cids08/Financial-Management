<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Anyone may attempt to log in.
        return true;
    }

    public function rules(): array
    {
        return [
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
            // Per-tab ID generated client-side (authToken.js), used to
            // exclude the device that's currently logging in from its own
            // ForcedLogout broadcast. Optional/nullable so nothing breaks
            // for any client that predates this feature.
            'client_session_id' => ['nullable', 'string', 'max:100'],
            // Honeypot fields — HoneypotCheck middleware reads these
            // directly off the request before this FormRequest resolves,
            // but they're declared here too so validation doesn't reject
            // or silently drop them as unexpected input.
            'website' => ['sometimes', 'nullable', 'string'],
            'form_rendered_at' => ['sometimes', 'nullable', 'integer'],
        ];
    }
}