<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadCollectionProofRequest extends FormRequest
{
    public function authorize(): bool
    {
        // collections.manage already enforced by route middleware —
        // same pattern as UploadDisbursementProofRequest.
        return true;
    }

    public function rules(): array
    {
        return [
            // Proof of receipt — images and PDFs only (no Word/Excel
            // since this is a receipt scan, not a plan document).
            'proof' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'], // 10MB
        ];
    }
}