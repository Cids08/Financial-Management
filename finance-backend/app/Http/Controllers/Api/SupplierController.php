<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSupplierRequest;
use App\Http\Requests\UpdateSupplierRequest;
use App\Http\Resources\SupplierResource;
use App\Models\Supplier;
use App\Services\SupplierService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupplierController extends Controller
{
    public function __construct(protected SupplierService $supplierService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $suppliers = $this->supplierService->list([
            'search' => $request->string('search')->toString(),
            'status' => $request->string('status')->toString(),
            'archived' => $request->boolean('archived'),
            'per_page' => $request->integer('per_page', 15),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => SupplierResource::collection($suppliers),
            'meta' => [
                'current_page' => $suppliers->currentPage(),
                'last_page' => $suppliers->lastPage(),
                'total' => $suppliers->total(),
            ],
        ]);
    }

    public function store(StoreSupplierRequest $request): JsonResponse
    {
        $supplier = $this->supplierService->create($request->validated(), $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Supplier added successfully.',
            'data' => new SupplierResource($supplier),
        ], 201);
    }

    public function update(UpdateSupplierRequest $request, Supplier $supplier): JsonResponse
    {
        $supplier = $this->supplierService->update($supplier, $request->validated(), $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Supplier updated successfully.',
            'data' => new SupplierResource($supplier),
        ]);
    }

    public function archive(Request $request, Supplier $supplier): JsonResponse
    {
        $supplier = $this->supplierService->archive($supplier, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Supplier archived.',
            'data' => new SupplierResource($supplier),
        ]);
    }

    public function restore(int $supplier): JsonResponse
    {
        $model = Supplier::onlyTrashed()->findOrFail($supplier);
        $model = $this->supplierService->restore($model);

        return response()->json([
            'success' => true,
            'message' => 'Supplier restored.',
            'data' => new SupplierResource($model),
        ]);
    }

    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->supplierService->stats(),
        ]);
    }
}