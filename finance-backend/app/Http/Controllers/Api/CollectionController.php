<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCollectionRequest;
use App\Http\Requests\UpdateCollectionRequest;
use App\Http\Requests\UploadCollectionProofRequest;
use App\Http\Resources\CollectionResource;
use App\Models\Collection;
use App\Models\SupportingDocument;
use App\Services\CollectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CollectionController extends Controller
{
    public function __construct(private readonly CollectionService $collections)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Collection::class);

        $paginated = $this->collections->list([
            'search'       => $request->query('search'),
            'collector_id' => $request->query('collector_id'),
            'status'       => $request->query('status'),
            'trashed'      => $request->boolean('trashed'),
            'per_page'     => (int) $request->query('per_page', 15),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => CollectionResource::collection($paginated->items()),
            'meta'    => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    public function store(StoreCollectionRequest $request): JsonResponse
    {
        $this->authorize('create', Collection::class);

        try {
            $collection = $this->collections->create($request->validated(), $request->user());
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        $collection->load([
            'accountsReceivable:id,invoice_number',
            'collector:id,first_name,last_name',
            'cashAccount:id,account_name',
            'receiver:id,first_name,last_name',
            'creator:id,first_name,last_name',
            'deleter:id,first_name,last_name',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Collection recorded.',
            'data'    => new CollectionResource($collection),
        ], 201);
    }

    public function update(UpdateCollectionRequest $request, Collection $collection): JsonResponse
    {
        $this->authorize('update', $collection);

        try {
            $collection = $this->collections->update($collection, $request->validated(), $request->user());
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Collection updated.',
            'data'    => new CollectionResource($collection),
        ]);
    }

    public function confirm(Request $request, Collection $collection): JsonResponse
    {
        // Policy checks both permission AND that the collection is still
        // pending — catches the race condition before the transaction opens.
        $this->authorize('confirm', $collection);

        try {
            $collection = $this->collections->confirm($collection, $request->user());
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Collection confirmed.',
            'data'    => new CollectionResource($collection),
        ]);
    }

    public function cancel(Request $request, Collection $collection): JsonResponse
    {
        // Same pattern as confirm — Policy validates permission + status
        // before the service opens its transaction.
        $this->authorize('cancel', $collection);

        $request->validate(['remarks' => ['nullable', 'string', 'max:500']]);

        try {
            $collection = $this->collections->cancel($collection, $request->user(), $request->input('remarks'));
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Collection cancelled.',
            'data'    => new CollectionResource($collection),
        ]);
    }

    public function archive(Request $request, Collection $collection): JsonResponse
    {
        $this->authorize('archive', $collection);

        $this->collections->archive($collection, $request->user());

        return response()->json(['success' => true, 'message' => 'Collection archived.', 'data' => null]);
    }

    public function restore(Request $request, Collection $collection): JsonResponse
    {
        $this->authorize('restore', $collection);

        $collection = $this->collections->restore($collection, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Collection restored.',
            'data'    => new CollectionResource($collection),
        ]);
    }

    /**
     * GET /api/collections/{collection}/proof/{document}/view
     * Serve a specific proof version inline (Content-Disposition: inline)
     * so the browser can render PDFs and images natively in a new tab.
     * Non-previewable types (none expected here since we only accept
     * pdf/jpg/jpeg/png) will still download — browser limitation.
     *
     * Ownership check on reference_type + reference_id mirrors
     * BudgetController::viewPlanVersion() — prevents ID enumeration
     * across modules since supporting_documents is a shared table.
     */
    public function viewProof(Collection $collection, SupportingDocument $document): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        $this->authorize('view', $collection);

        if ($document->reference_type !== 'collection' || (int) $document->reference_id !== $collection->id) {
            abort(404, 'This document does not belong to this collection.');
        }

        if (! $document->storage_path) {
            abort(404, 'No file stored for this proof version.');
        }

        $fullPath = \Illuminate\Support\Facades\Storage::disk('local')->path($document->storage_path);

        return response()->file($fullPath, [
            'Content-Type' => $document->mime_type ?? 'application/octet-stream',
        ]);
    }

    /**
     * POST /api/collections/{collection}/proof
     * Attach a proof-of-receipt document. Re-uploading adds a new version;
     * it does not replace the previous one (history is preserved).
     */
    public function attachProof(UploadCollectionProofRequest $request, Collection $collection): JsonResponse
    {
        $this->authorize('update', $collection);

        try {
            $document = $this->collections->attachProof(
                $collection,
                $request->file('proof'),
                $request->user()
            );
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Proof of receipt attached.',
            'data'    => [
                'id'            => $document->id,
                'original_name' => $document->original_name,
                'file_size'     => $document->file_size,
                'mime_type'     => $document->mime_type,
                'uploaded_at'   => $document->uploaded_at?->toIso8601String(),
                'has_file'      => true,
            ],
        ], 201);
    }

    /**
     * GET /api/collections/{collection}/proof
     * Return the full proof upload history for a collection, newest first.
     */
    public function proofHistory(Collection $collection): JsonResponse
    {
        $this->authorize('view', $collection);

        $documents = $this->collections->getProofHistory($collection);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $documents->map(fn ($doc) => [
                'id'               => $doc->id,
                'original_name'    => $doc->original_name,
                'file_size'        => $doc->file_size,
                'mime_type'        => $doc->mime_type,
                'uploaded_at'      => $doc->uploaded_at?->toIso8601String(),
                'uploaded_by_name' => $doc->uploaded_by_name,
                'has_file'         => $doc->has_file,
            ]),
        ]);
    }

    /**
     * GET /api/collections/efficiency?period=day|week|month|year&limit=12
     *
     * Returns aggregate efficiency across ALL collectors — total collected
     * vs combined monthly target, bucketed by the requested granularity.
     * Per-collector breakdown lives on the Collector page instead.
     */
    public function efficiency(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Collection::class);

        $period = $request->query('period', 'month');
        $limit  = (int) $request->query('limit', 12);

        try {
            $data = $this->collections->efficiency($period, $limit);
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $data,
        ]);
    }
}