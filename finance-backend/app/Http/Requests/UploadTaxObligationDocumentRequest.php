<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadTaxObligationDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Unlike UploadExpenseReceiptRequest (a stub backed by an explicit
        // $this->authorize('update', $expense) Policy check inside
        // ExpenseController), TaxObligationController has no per-record
        // Policy anywhere else in this module — create/update/archive/
        // restore are all gated purely by the tax.manage route permission
        // (see StoreTaxObligationRequest/UpdateTaxObligationRequest).
        // Matching that existing convention rather than introducing a new
        // TaxObligationPolicy just for this one endpoint.
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // Images/PDF only, same restriction as UploadExpenseReceiptRequest
            // and UploadCollectionProofRequest — this is a receipt/proof
            // scan, not a planning document like Budget's plan upload
            // (which additionally allows doc/docx/xls/xlsx).
            'document' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];
    }
}