<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadDisbursementProofRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // disbursements.manage already enforced by route middleware
    }

    public function rules(): array
    {
        return [
            'proof' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'], // 10MB
        ];
    }
}