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
            'image' => ['required', 'image', 'mimes:jpeg,png,webp', 'max:8192'],
        ]);

        $result = $this->ocr->scan($request->file('image'));

        if (! $result['is_receipt']) {
            return response()->json([
                'success' => false,
                'message' => "This doesn't look like an invoice or receipt — please upload a clearer photo, or fill in the details manually.",
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