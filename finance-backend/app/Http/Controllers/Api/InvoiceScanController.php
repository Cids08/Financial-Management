<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InvoiceOcrService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InvoiceScanController extends Controller
{
    public function __construct(protected InvoiceOcrService $ocr)
    {
    }

    public function scan(Request $request): JsonResponse
    {
        $request->validate([
            'image' => [
                'required',
                'file',
                'mimes:jpeg,png,webp,pdf',
                'max:10240',
            ],
        ]);

        $file = $request->file('image');
        $isPdf = $file->getClientMimeType() === 'application/pdf'
            || strtolower($file->getClientOriginalExtension()) === 'pdf';

        $result = $isPdf
            ? $this->ocr->scanPdf($file)
            : $this->ocr->scan($file);

        if (! $result['is_receipt']) {
            return response()->json([
                'success' => false,
                'message' => $result['message'] ?? "This doesn't look like an invoice or receipt — please upload a clearer document or bill.",
                'data' => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => [
                'invoice_number' => $result['invoice_number'],
                'invoice_date' => $result['date'],
                'due_date' => $result['due_date'],
                'amount' => $result['amount'],
                'reference_no' => $result['reference_no'],
            ],
        ]);
    }
}