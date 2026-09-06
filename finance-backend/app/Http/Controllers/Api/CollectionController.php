<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCollectionRequest;
use App\Http\Requests\UpdateCollectionRequest;
use App\Http\Resources\CollectionResource;
use App\Models\Collection;
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

        $user = $request->user();
        $collectorId = $request->query('collector_id');

        // CollectionPolicy::viewAny() only checks "does this user have
        // collections.view at all" — it can't know which specific rows
        // they should see. That row-level scoping has to happen here: a
        // Collector may only ever see their own collections, regardless
        // of what collector_id (or lack of one) the client sends.
        if ($user->hasRole('collector')) {
            $ownCollectorId = $user->collector?->id;

            // Fail closed: an unlinked Collector-role account sees
            // nothing, not everything.
            if ($ownCollectorId === null) {
                return response()->json([
                    'success' => true,
                    'message' => '',
                    'data'    => [],
                    'meta'    => [
                        'current_page' => 1,
                        'last_page'    => 1,
                        'per_page'     => (int) $request->query('per_page', 15),
                        'total'        => 0,
                    ],
                ]);
            }

            $collectorId = $ownCollectorId;
        }

        $paginated = $this->collections->list([
            'search'       => $request->query('search'),
            'collector_id' => $collectorId,
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