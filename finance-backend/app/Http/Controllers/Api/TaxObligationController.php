<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTaxObligationRequest;
use App\Http\Requests\UpdateTaxObligationRequest;
use App\Http\Resources\TaxObligationResource;
use App\Models\TaxObligation;
use App\Services\TaxObligationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

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
     */
    public function restore(Request $request, int $taxObligation): JsonResponse
    {
        $obligation = TaxObligation::onlyTrashed()->with(['createdBy', 'deletedBy', 'expense'])->findOrFail($taxObligation);
        $obligation = $this->taxObligationService->restore($request->user(), $obligation);

        return response()->json([
            'success' => true,
            'message' => 'Tax obligation restored.',
            'data'    => new TaxObligationResource($obligation),
        ]);
    }
}