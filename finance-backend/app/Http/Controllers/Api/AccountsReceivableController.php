<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccountsReceivableRequest;
use App\Http\Requests\UpdateAccountsReceivableRequest;
use App\Http\Resources\AccountsReceivableResource;
use App\Models\AccountsReceivable;
use App\Services\AccountsReceivableService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountsReceivableController extends Controller
{
    public function __construct(protected AccountsReceivableService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = [
            'status' => $request->query('status'),
            'search' => $request->query('search'),
        ];

        if ($request->has('archived')) {
            $filters['archived'] = filter_var($request->query('archived'), FILTER_VALIDATE_BOOLEAN);
        }

        $records = $this->service->list($filters);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => AccountsReceivableResource::collection($records),
        ]);
    }

    public function store(StoreAccountsReceivableRequest $request): JsonResponse
    {
        $ar = $this->service->create($request->user(), $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Invoice created successfully.',
            'data' => new AccountsReceivableResource($ar),
        ], 201);
    }

    public function update(UpdateAccountsReceivableRequest $request, AccountsReceivable $accountsReceivable): JsonResponse
    {
        $ar = $this->service->update($request->user(), $accountsReceivable, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Invoice updated successfully.',
            'data' => new AccountsReceivableResource($ar),
        ]);
    }

    /**
     * Single toggle endpoint — matches the frontend's one-button
     * archive/restore action rather than separate REST verbs.
     */
    public function toggleArchive(Request $request, AccountsReceivable $accountsReceivable): JsonResponse
    {
        $ar = $this->service->toggleArchive($request->user(), $accountsReceivable);

        return response()->json([
            'success' => true,
            'message' => $ar->is_archived ? 'Invoice archived.' : 'Invoice restored.',
            'data' => new AccountsReceivableResource($ar),
        ]);
    }
}