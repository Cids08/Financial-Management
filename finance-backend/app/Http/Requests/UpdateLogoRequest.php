<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateLogoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'logo' => [
                'required',
                // 'image' (not 'file') actually decodes the upload via
                // getimagesize() to confirm it's a real, structurally
                // valid image — 'file' alone only confirms something was
                // uploaded, not that its content matches its claimed type.
                'image',
                // SVG deliberately excluded: an SVG can embed a <script>
                // tag inside itself, which executes if the file is ever
                // rendered directly in a browser (an <img> tag pointing
                // at it, or opened in a new tab) — stored XSS via what
                // looks like an ordinary logo upload. This is also why
                // 'image' now works here instead of needing 'file': SVG
                // was the one format 'image' couldn't validate anyway.
                'mimes:jpg,jpeg,png,webp',
                'max:2048',
                // A logo is a small UI element — no legitimate reason for
                // it to be huge in pixel dimensions even if the byte size
                // is small (compression can hide a large canvas).
                'dimensions:max_width=2000,max_height=2000',
            ],
        ];
    }
}