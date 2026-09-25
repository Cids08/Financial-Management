<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreChartOfAccountRequest;
use App\Http\Requests\UpdateChartOfAccountRequest;
use App\Http\Resources\ChartOfAccountResource;
use App\Models\ChartOfAccount;
use App\Services\ChartOfAccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChartOfAccountController extends Controller
{
    public function __construct(protected ChartOfAccountService $service)
    {
    }

    /** GET /api/chart-of-accounts?search=&type=&include_inactive=&per_page= */
    public function index(Request $request): JsonResponse
    {
        $paginated = $this->service->list([
            'search' => $request->string('search')->toString(),
            'type' => $request->string('type')->toString(),
            'include_inactive' => $request->boolean('include_inactive'),
            'inactive_only' => $request->boolean('inactive_only'),
            'posted' => $request->boolean('posted'),
            'per_page' => $request->integer('per_page') ?: 25,
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => ChartOfAccountResource::collection($paginated->items()),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    /** GET /api/chart-of-accounts/for-select — small active list for dropdowns. */
    public function dropdown(Request $request): JsonResponse
    {
        $accounts = $this->service->list([
            'search' => $request->string('search')->toString(),
        ])->getCollection();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => ChartOfAccountResource::collection($accounts),
        ]);
    }

    public function store(StoreChartOfAccountRequest $request): JsonResponse
    {
        $account = $this->service->create($request->user(), $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Chart of account added successfully.',
            'data' => new ChartOfAccountResource($account),
        ], 201);
    }

    public function update(UpdateChartOfAccountRequest $request, ChartOfAccount $chartOfAccount): JsonResponse
    {
        $account = $this->service->update($request->user(), $chartOfAccount, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Chart of account updated successfully.',
            'data' => new ChartOfAccountResource($account),
        ]);
    }

    /** PATCH /api/chart-of-accounts/{chartOfAccount}/toggle-active */
    public function toggleActive(Request $request, ChartOfAccount $chartOfAccount): JsonResponse
    {
        $account = $this->service->toggleActive($request->user(), $chartOfAccount);

        return response()->json([
            'success' => true,
            'message' => $account->is_active ? 'Chart of account activated.' : 'Chart of account deactivated.',
            'data' => new ChartOfAccountResource($account),
        ]);
    }
}