<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\BatchRecordTaxPaymentRequest;
use App\Http\Requests\GenerateTaxScheduleRequest;
use App\Http\Requests\RecordTaxPaymentRequest;
use App\Http\Requests\StoreTaxObligationRequest;
use App\Http\Requests\UpdateTaxObligationRequest;
use App\Http\Requests\UploadTaxObligationDocumentRequest;
use App\Http\Resources\TaxObligationResource;
use App\Models\SupportingDocument;
use App\Models\TaxObligation;
use App\Services\TaxObligationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class TaxObligationController extends Controller
{
    public function __construct(protected TaxObligationService $taxObligationService)
    {
    }

    /**
     * GET /api/tax-obligations?search=&status=Pending|Overdue|Paid&archived=0|1
     */
    public function index(Request $request): JsonResponse
    {
        $paginated = $this->taxObligationService->list([
            'search'   => $request->string('search')->toString(),
            'status'   => $request->string('status')->toString(),
            'archived' => $request->boolean('archived'),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => TaxObligationResource::collection($paginated->items()),
            'meta'    => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /**
     * GET /api/tax-obligations/calculate-base?tax_type=VAT&period_year=2026&period_month=3&period_quarter=1
     */
    public function calculateBase(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tax_type'       => ['required', 'string'],
            'period_year'    => ['required', 'integer', 'min:2000', 'max:2100'],
            'period_month'   => ['nullable', 'integer', 'min:1', 'max:12'],
            'period_quarter' => ['nullable', 'integer', 'min:1', 'max:4'],
        ]);

        try {
            $data = $this->taxObligationService->calculateBase(
                $validated['tax_type'],
                (int) $validated['period_year'],
                isset($validated['period_month']) ? (int) $validated['period_month'] : null,
                isset($validated['period_quarter']) ? (int) $validated['period_quarter'] : null
            );
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors'  => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Tax base auto-calculated successfully from system transactions.',
            'data'    => $data,
        ]);
    }

    public function store(StoreTaxObligationRequest $request): JsonResponse
    {
        try {
            $obligation = $this->taxObligationService->create($request->user(), $request->validated());
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Tax obligation added successfully.',
            'data'    => new TaxObligationResource($obligation),
        ], 201);
    }

    public function update(UpdateTaxObligationRequest $request, TaxObligation $taxObligation): JsonResponse
    {
        try {
            $taxObligation = $this->taxObligationService->update($request->user(), $taxObligation, $request->validated());
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Tax obligation updated successfully.',
            'data'    => new TaxObligationResource($taxObligation),
        ]);
    }

    /**
     * DELETE /api/tax-obligations/{taxObligation} — archives (soft delete).
     */
    public function archive(Request $request, TaxObligation $taxObligation): JsonResponse
    {
        $taxObligation = $this->taxObligationService->archive($request->user(), $taxObligation);

        return response()->json([
            'success' => true,
            'message' => 'Tax obligation archived.',
            'data'    => new TaxObligationResource($taxObligation),
        ]);
    }

    /**
     * PATCH /api/tax-obligations/{taxObligation}/restore
     *
     * Takes a plain int id rather than an implicit-bound TaxObligation:
     * the record is soft-deleted at this point, so normal route model
     * binding wouldn't resolve it anyway. The onlyTrashed() lookup lives
     * in TaxObligationService::restore() — the controller just passes the
     * id through and lets the service own the query, same as every other
     * action here.
     */
    public function restore(Request $request, int $taxObligation): JsonResponse
    {
        $obligation = $this->taxObligationService->restore($request->user(), $taxObligation);

        return response()->json([
            'success' => true,
            'message' => 'Tax obligation restored.',
            'data'    => new TaxObligationResource($obligation),
        ]);
    }

    /**
     * POST /api/tax-obligations/{taxObligation}/document
     * Attach a supporting document (BIR receipt, official receipt scan,
     * etc.). Re-uploading adds a new version; it does not replace the
     * previous one. Naming (singular "document", method name
     * attachDocument) matches AccountsPayableController's real document
     * routes exactly, rather than ExpenseController's older
     * uploadReceipt/receipts naming — there's no per-record Policy check
     * here either way; see UploadTaxObligationDocumentRequest's docblock
     * for why this stays on route-permission-only gating instead of
     * introducing a TaxObligationPolicy.
     */
    public function attachDocument(UploadTaxObligationDocumentRequest $request, TaxObligation $taxObligation): JsonResponse
    {
        try {
            $document = $this->taxObligationService->attachDocument(
                $taxObligation,
                $request->file('document'),
                $request->user()
            );
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Document uploaded.',
            'data' => [
                'id' => $document->id,
                'original_name' => $document->original_name,
                'file_size' => $document->file_size,
                'mime_type' => $document->mime_type,
                'uploaded_at' => $document->uploaded_at?->toIso8601String(),
                'has_file' => true,
            ],
        ], 201);
    }

    /**
     * GET /api/tax-obligations/{taxObligation}/document
     * Full upload history, newest first, same path AccountsPayable's
     * documentHistory() uses (singular "document" for both the GET
     * history and the POST upload). Inline array shape — no
     * SupportingDocumentResource class in this codebase to delegate to.
     */
    public function documentHistory(TaxObligation $taxObligation): JsonResponse
    {
        $documents = $this->taxObligationService->getDocumentHistory($taxObligation);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $documents->map(fn ($doc) => [
                'id' => $doc->id,
                'original_name' => $doc->original_name,
                'file_size' => $doc->file_size,
                'mime_type' => $doc->mime_type,
                'uploaded_at' => $doc->uploaded_at?->toIso8601String(),
                'uploaded_by_name' => $doc->uploaded_by_name,
                'has_file' => $doc->has_file,
            ]),
        ]);
    }

    /**
     * GET /api/tax-obligations/{taxObligation}/document/{document}/view
     * Serve a specific document version inline, matching
     * AccountsPayableController::viewDocument()'s path shape. Same
     * reference_type + reference_id ownership check as every other
     * module's view endpoint — supporting_documents is a shared table, so
     * this is what stops someone guessing a document ID that belongs to a
     * different module or a different tax obligation entirely.
     */
    public function viewDocument(TaxObligation $taxObligation, SupportingDocument $document): BinaryFileResponse
    {
        if ($document->reference_type !== 'tax_obligation' || (int) $document->reference_id !== $taxObligation->id) {
            abort(404, 'This document does not belong to this tax obligation.');
        }

        if (! $document->storage_path) {
            abort(404, 'No file stored for this document.');
        }

        $fullPath = Storage::disk('local')->path($document->storage_path);

        return response()->file($fullPath, [
            'Content-Type' => $document->mime_type ?? 'application/octet-stream',
        ]);
    }

    /**
     * POST /api/tax-obligations/{taxObligation}/pay
     */
    public function recordPayment(RecordTaxPaymentRequest $request, TaxObligation $taxObligation): JsonResponse
    {
        try {
            $taxObligation = $this->taxObligationService->recordPayment(
                $request->user(),
                $taxObligation,
                $request->validated(),
                $request->file('document')
            );
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors'  => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Tax payment recorded successfully. General Ledger journal entry and cash account deduction posted.',
            'data'    => new TaxObligationResource($taxObligation),
        ]);
    }

    /**
     * POST /api/tax-obligations/batch-pay
     */
    public function batchRecordPayment(BatchRecordTaxPaymentRequest $request): JsonResponse
    {
        try {
            $result = $this->taxObligationService->batchRecordPayment(
                $request->user(),
                $request->validated(),
                $request->file('document')
            );
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors'  => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => sprintf(
                'Successfully recorded batch payment for %d tax obligation(s) totalling ₱%s.',
                $result['count'],
                number_format($result['total_amount'], 2)
            ),
            'data'    => [
                'count'        => $result['count'],
                'total_amount' => $result['total_amount'],
                'obligations'  => TaxObligationResource::collection($result['obligations']),
            ],
        ]);
    }

    /**
     * POST /api/tax-obligations/generate-schedule
     *
     * Auto-generates periodic tax filing obligations for a fiscal year / quarter.
     */
    public function generateSchedule(GenerateTaxScheduleRequest $request): JsonResponse
    {
        try {
            $result = $this->taxObligationService->generateSchedule($request->user(), $request->validated());
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors'  => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => sprintf(
                'Successfully generated %d tax obligation schedule(s) (%d already existed and were skipped).',
                $result['created_count'],
                $result['skipped_count']
            ),
            'data'    => $result,
        ]);
    }
}