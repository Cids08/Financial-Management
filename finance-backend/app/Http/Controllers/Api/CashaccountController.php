<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCashAccountRequest;
use App\Http\Requests\UpdateCashAccountRequest;
use App\Http\Resources\CashAccountResource;
use App\Models\CashAccount;
use App\Services\CashAccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CashAccountController extends Controller
{
    public function __construct(protected CashAccountService $cashAccountService)
    {
    }

    /**
     * GET /api/cash-accounts?search=&type=Checking&archived=0|1
     */
    public function index(Request $request): JsonResponse
    {
        $paginated = $this->cashAccountService->list([
            'search'   => $request->string('search')->toString(),
            'type'     => $request->string('type')->toString(),
            'archived' => $request->boolean('archived'),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => CashAccountResource::collection($paginated->items()),
            'meta'    => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    public function store(StoreCashAccountRequest $request): JsonResponse
    {
        $account = $this->cashAccountService->create($request->user(), $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Cash account added successfully.',
            'data'    => new CashAccountResource($account),
        ], 201);
    }

    public function update(UpdateCashAccountRequest $request, CashAccount $cashAccount): JsonResponse
    {
        $cashAccount = $this->cashAccountService->update($request->user(), $cashAccount, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Cash account updated successfully.',
            'data'    => new CashAccountResource($cashAccount),
        ]);
    }

    /**
     * DELETE /api/cash-accounts/{cash_account} — archives (soft delete).
     */
    public function archive(Request $request, CashAccount $cashAccount): JsonResponse
    {
        $cashAccount = $this->cashAccountService->archive($request->user(), $cashAccount);

        return response()->json([
            'success' => true,
            'message' => 'Cash account archived.',
            'data'    => new CashAccountResource($cashAccount),
        ]);
    }

    /**
     * PATCH /api/cash-accounts/{cashAccount}/restore
     */
    public function restore(Request $request, int $cashAccount): JsonResponse
    {
        $account = CashAccount::onlyTrashed()->findOrFail($cashAccount);
        $account = $this->cashAccountService->restore($request->user(), $account);

        return response()->json([
            'success' => true,
            'message' => 'Cash account restored.',
            'data'    => new CashAccountResource($account),
        ]);
    }
}