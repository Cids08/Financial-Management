<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadExpenseReceiptRequest extends FormRequest
{
    public function authorize(): bool
    {
        // expenses.manage already enforced by route middleware — same
        // pattern as UploadCollectionProofRequest.
        return true;
    }

    public function rules(): array
    {
        return [
            // Receipt scan/photo — images and PDFs only, same allowed
            // types as UploadCollectionProofRequest (this is a receipt,
            // not a plan document like Budget's upload).
            'receipt' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'], // 10MB
        ];
    }
}