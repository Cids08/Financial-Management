<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAvatarRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // Mirrors the frontend AvatarUploadModal constraints:
            // JPG / PNG / WEBP, up to 5MB.
            'avatar' => [
                'required',
                'file',
                'mimes:jpg,jpeg,png,webp',
                'max:5120', // KB
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'avatar.mimes' => 'Please use a JPG, PNG, or WEBP image.',
            'avatar.max'   => 'Image must be under 5MB.',
        ];
    }
}