<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccountsPayableRequest;
use App\Http\Requests\UpdateAccountsPayableRequest;
use App\Http\Resources\AccountsPayableResource;
use App\Models\AccountsPayable;
use App\Services\AccountsPayableService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountsPayableController extends Controller
{
    public function __construct(protected AccountsPayableService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $archived = $request->boolean('archived');

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => AccountsPayableResource::collection($this->service->list($archived)),
        ]);
    }

    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->service->stats(),
        ]);
    }

    public function store(StoreAccountsPayableRequest $request): JsonResponse
    {
        $bill = $this->service->create($request->user(), $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Bill created successfully.',
            'data' => new AccountsPayableResource($bill),
        ], 201);
    }

    public function update(UpdateAccountsPayableRequest $request, AccountsPayable $accountsPayable): JsonResponse
    {
        $bill = $this->service->update($request->user(), $accountsPayable, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Bill updated successfully.',
            'data' => new AccountsPayableResource($bill),
        ]);
    }

    public function approve(Request $request, AccountsPayable $accountsPayable): JsonResponse
    {
        $bill = $this->service->approve($request->user(), $accountsPayable);

        return response()->json([
            'success' => true,
            'message' => 'Bill approved successfully.',
            'data' => new AccountsPayableResource($bill),
        ]);
    }

    public function archive(Request $request, AccountsPayable $accountsPayable): JsonResponse
    {
        $this->service->archive($request->user(), $accountsPayable);

        return response()->json([
            'success' => true,
            'message' => 'Bill archived successfully.',
        ]);
    }

    // {accountsPayable} must resolve a soft-deleted record — see routes,
    // needs withTrashed() same as the users restore route.
    public function restore(Request $request, AccountsPayable $accountsPayable): JsonResponse
    {
        $this->service->restore($request->user(), $accountsPayable);

        return response()->json([
            'success' => true,
            'message' => 'Bill restored successfully.',
        ]);
    }
}