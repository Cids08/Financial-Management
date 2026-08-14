<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFixedAssetRequest;
use App\Http\Requests\UpdateFixedAssetRequest;
use App\Http\Resources\FixedAssetResource;
use App\Models\FixedAsset;
use App\Services\FixedAssetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FixedAssetController extends Controller
{
    public function __construct(protected FixedAssetService $fixedAssetService)
    {
    }

    /**
     * GET /api/fixed-assets?search=&category=&status=&archived=0|1
     */
    public function index(Request $request): JsonResponse
    {
        $paginated = $this->fixedAssetService->list([
            'search'   => $request->string('search')->toString(),
            'category' => $request->string('category')->toString(),
            'status'   => $request->string('status')->toString(),
            'archived' => $request->boolean('archived'),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => FixedAssetResource::collection($paginated->items()),
            'meta'    => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    public function store(StoreFixedAssetRequest $request): JsonResponse
    {
        $asset = $this->fixedAssetService->create($request->user(), $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Asset added successfully.',
            'data'    => new FixedAssetResource($asset->load('department')),
        ], 201);
    }

    public function update(UpdateFixedAssetRequest $request, FixedAsset $fixedAsset): JsonResponse
    {
        $fixedAsset = $this->fixedAssetService->update($request->user(), $fixedAsset, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Asset updated successfully.',
            'data'    => new FixedAssetResource($fixedAsset),
        ]);
    }

    /**
     * DELETE /api/fixed-assets/{fixedAsset} — archives (soft delete).
     */
    public function archive(Request $request, FixedAsset $fixedAsset): JsonResponse
    {
        $fixedAsset = $this->fixedAssetService->archive($request->user(), $fixedAsset);

        return response()->json([
            'success' => true,
            'message' => 'Asset archived.',
            'data'    => new FixedAssetResource($fixedAsset),
        ]);
    }

    /**
     * PATCH /api/fixed-assets/{fixedAsset}/restore
     */
    public function restore(Request $request, int $fixedAsset): JsonResponse
    {
        $asset = FixedAsset::onlyTrashed()->with('department')->findOrFail($fixedAsset);
        $asset = $this->fixedAssetService->restore($request->user(), $asset);

        return response()->json([
            'success' => true,
            'message' => 'Asset restored.',
            'data'    => new FixedAssetResource($asset),
        ]);
    }
}