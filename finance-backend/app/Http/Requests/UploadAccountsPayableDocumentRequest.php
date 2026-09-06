<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadAccountsPayableDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        // ap.manage already enforced by route middleware — same pattern
        // as UploadExpenseReceiptRequest / UploadCollectionProofRequest.
        // Controller also runs AccountsPayablePolicy::attachDocument()
        // as the real authorization check (see that method for why this
        // deliberately does NOT reuse the update() policy's approved/
        // Paid/Cancelled restrictions).
        return true;
    }

    public function rules(): array
    {
        return [
            // Same allowed types/size as UploadExpenseReceiptRequest —
            // a scan/photo of a physical bill or supplier invoice, not a
            // Word/Excel plan document like Budget's upload.
            'document' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'], // 10MB
        ];
    }
}