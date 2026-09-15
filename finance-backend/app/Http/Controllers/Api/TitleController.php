<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTitleRequest;
use App\Http\Requests\UpdateTitleRequest;
use App\Http\Resources\TitleResource;
use App\Models\Title;
use App\Services\TitleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class TitleController extends Controller
{
    public function __construct(protected TitleService $titleService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $titles = $this->titleService->list([
            'search' => $request->string('search')->toString(),
            'per_page' => $request->integer('per_page', 15),
            'archived' => $request->boolean('archived'),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => TitleResource::collection($titles),
            'meta' => [
                'current_page' => $titles->currentPage(),
                'last_page' => $titles->lastPage(),
                'total' => $titles->total(),
            ],
        ]);
    }

    public function store(StoreTitleRequest $request): JsonResponse
    {
        $title = $this->titleService->create($request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Position added successfully.',
            'data' => new TitleResource($title),
        ], 201);
    }

    public function update(UpdateTitleRequest $request, Title $title): JsonResponse
    {
        $title = $this->titleService->update($title, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Position updated successfully.',
            'data' => new TitleResource($title),
        ]);
    }

    public function archive(Title $title): JsonResponse
    {
        try {
            $this->titleService->archive($title);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
                'data' => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Position archived successfully.',
            'data' => null,
        ]);
    }

    public function restore(Title $title): JsonResponse
    {
        $this->titleService->restore($title);

        return response()->json([
            'success' => true,
            'message' => 'Position restored successfully.',
            'data' => null,
        ]);
    }
}