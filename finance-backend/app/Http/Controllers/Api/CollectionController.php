<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCollectionRequest;
use App\Http\Requests\UpdateCollectionRequest;
use App\Http\Resources\CollectionResource;
use App\Models\Collection;
use App\Models\Collector;
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
        $paginated = $this->collections->list([
            'search' => $request->query('search'),
            'collector_id' => $request->query('collector_id'),
            'status' => $request->query('status'),
            'trashed' => $request->boolean('trashed'),
            'per_page' => (int) $request->query('per_page', 15),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => CollectionResource::collection($paginated->items()),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    public function store(StoreCollectionRequest $request): JsonResponse
    {
        try {
            $collection = $this->collections->create($request->validated(), $request->user());
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        $collection->load(['accountsReceivable:id,invoice_number', 'collector:id,first_name,last_name', 'cashAccount:id,account_name']);

        return response()->json([
            'success' => true,
            'message' => 'Collection recorded.',
            'data' => new CollectionResource($collection),
        ], 201);
    }

    public function update(UpdateCollectionRequest $request, Collection $collection): JsonResponse
    {
        try {
            $collection = $this->collections->update($collection, $request->validated());
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Collection updated.',
            'data' => new CollectionResource($collection),
        ]);
    }

    public function confirm(Request $request, Collection $collection): JsonResponse
    {
        try {
            $collection = $this->collections->confirm($collection, $request->user());
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Collection confirmed.',
            'data' => new CollectionResource($collection),
        ]);
    }

    public function cancel(Request $request, Collection $collection): JsonResponse
    {
        $request->validate(['remarks' => ['nullable', 'string', 'max:500']]);

        try {
            $collection = $this->collections->cancel($collection, $request->input('remarks'));
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Collection cancelled.',
            'data' => new CollectionResource($collection),
        ]);
    }

    public function archive(Collection $collection): JsonResponse
    {
        $this->collections->archive($collection);

        return response()->json(['success' => true, 'message' => 'Collection archived.', 'data' => null]);
    }

    public function restore(Collection $collection): JsonResponse
    {
        $collection = $this->collections->restore($collection);

        return response()->json([
            'success' => true,
            'message' => 'Collection restored.',
            'data' => new CollectionResource($collection),
        ]);
    }

    /**
     * GET /api/collectors/{collector}/efficiency?period=day|week|month|year&limit=12
     */
    public function efficiency(Request $request, Collector $collector): JsonResponse
    {
        $period = $request->query('period', 'month');
        $limit = (int) $request->query('limit', 12);

        try {
            $data = $this->collections->efficiency($collector, $period, $limit);
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $data,
        ]);
    }
}