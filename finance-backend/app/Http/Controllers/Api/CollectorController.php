<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCollectorRequest;
use App\Http\Requests\UpdateCollectorRequest;
use App\Http\Resources\CollectorResource;
use App\Models\Collector;
use App\Services\CollectorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CollectorController extends Controller
{
    public function __construct(protected CollectorService $collectorService)
    {
    }

    /**
     * GET /api/collectors?search=&status=active|inactive&archived=0|1
     */
    public function index(Request $request): JsonResponse
    {
        $paginated = $this->collectorService->list([
            'search'   => $request->string('search')->toString(),
            'status'   => $request->string('status')->toString(),
            'archived' => $request->boolean('archived'),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => CollectorResource::collection($paginated->items()),
            'meta'    => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    public function store(StoreCollectorRequest $request): JsonResponse
    {
        $collector = $this->collectorService->create($request->user(), $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Collector added successfully.',
            'data'    => new CollectorResource($collector),
        ], 201);
    }

    public function update(UpdateCollectorRequest $request, Collector $collector): JsonResponse
    {
        $collector = $this->collectorService->update($request->user(), $collector, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Collector updated successfully.',
            'data'    => new CollectorResource($collector),
        ]);
    }

    /**
     * DELETE /api/collectors/{collector} — archives (soft delete), never
     * a hard delete, matching the mock's Archive button.
     */
    public function archive(Request $request, Collector $collector): JsonResponse
    {
        $collector = $this->collectorService->archive($request->user(), $collector);

        return response()->json([
            'success' => true,
            'message' => 'Collector archived.',
            'data'    => new CollectorResource($collector),
        ]);
    }

    /**
     * PATCH /api/collectors/{collector}/restore
     */
    public function restore(Request $request, int $collector): JsonResponse
    {
        $collector = Collector::onlyTrashed()->findOrFail($collector);
        $collector = $this->collectorService->restore($request->user(), $collector);

        return response()->json([
            'success' => true,
            'message' => 'Collector restored.',
            'data'    => new CollectorResource($collector),
        ]);
    }
}