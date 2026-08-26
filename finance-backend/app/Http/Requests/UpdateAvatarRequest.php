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
                // 'image' (not 'file') decodes the upload via
                // getimagesize() to confirm it's a structurally valid
                // image, not just a file with a matching extension.
                'image',
                'mimes:jpg,jpeg,png,webp',
                'max:5120', // KB
                // No legitimate profile photo needs to be enormous in
                // pixel dimensions — caps worst-case decode/resize cost
                // regardless of how small the uploaded file's byte size is.
                'dimensions:max_width=4000,max_height=4000',
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'avatar.mimes' => 'Please use a JPG, PNG, or WEBP image.',
            'avatar.max'   => 'Image must be under 5MB.',
            'avatar.dimensions' => 'Image dimensions are too large.',
        ];
    }
}