<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Services\CustomerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function __construct(protected CustomerService $customerService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $customers = $this->customerService->list([
            'search' => $request->string('search')->toString(),
            'status' => $request->string('status')->toString(),
            'archived' => $request->boolean('archived'),
            'per_page' => $request->integer('per_page', 15),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => CustomerResource::collection($customers),
            'meta' => [
                'current_page' => $customers->currentPage(),
                'last_page' => $customers->lastPage(),
                'total' => $customers->total(),
            ],
        ]);
    }

    public function store(StoreCustomerRequest $request): JsonResponse
    {
        $customer = $this->customerService->create($request->validated(), $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Customer added successfully.',
            'data' => new CustomerResource($customer),
        ], 201);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): JsonResponse
    {
        $customer = $this->customerService->update($customer, $request->validated(), $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Customer updated successfully.',
            'data' => new CustomerResource($customer),
        ]);
    }

    public function archive(Request $request, Customer $customer): JsonResponse
    {
        $customer = $this->customerService->archive($customer, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Customer archived.',
            'data' => new CustomerResource($customer),
        ]);
    }

    public function restore(int $customer): JsonResponse
    {
        $model = Customer::onlyTrashed()->findOrFail($customer);
        $model = $this->customerService->restore($model);

        return response()->json([
            'success' => true,
            'message' => 'Customer restored.',
            'data' => new CustomerResource($model),
        ]);
    }

    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->customerService->stats(),
        ]);
    }
}