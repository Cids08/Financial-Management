<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExpenseRequest;
use App\Http\Requests\UpdateExpenseRequest;
use App\Http\Resources\ExpenseResource;
use App\Models\Expense;
use App\Services\ExpenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ExpenseController extends Controller
{
    public function __construct(private readonly ExpenseService $expenses)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $paginated = $this->expenses->list([
            'search' => $request->query('search'),
            'status' => $request->query('status'),
            'budget_id' => $request->query('budget_id'),
            'expense_category_id' => $request->query('expense_category_id'),
            'trashed' => $request->boolean('trashed'),
            'per_page' => (int) $request->query('per_page', 15),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => ExpenseResource::collection($paginated->items()),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    public function store(StoreExpenseRequest $request): JsonResponse
    {
        $expense = $this->expenses->create($request->validated(), $request->user());
        $expense->load(['budget:id,budget_name', 'category:id,category_name', 'supplier:id,supplier_name', 'creator:id,first_name,last_name']);

        return response()->json([
            'success' => true,
            'message' => 'Expense recorded.',
            'data' => new ExpenseResource($expense),
        ], 201);
    }

    public function show(Expense $expense): JsonResponse
    {
        $expense->load(['budget:id,budget_name', 'category:id,category_name', 'supplier:id,supplier_name', 'creator:id,first_name,last_name', 'deleter:id,first_name,last_name']);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => new ExpenseResource($expense),
        ]);
    }

    public function update(UpdateExpenseRequest $request, Expense $expense): JsonResponse
    {
        try {
            $expense = $this->expenses->update($expense, $request->validated(), $request->user());
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }

        $expense->load(['budget:id,budget_name', 'category:id,category_name', 'supplier:id,supplier_name']);

        return response()->json([
            'success' => true,
            'message' => 'Expense updated.',
            'data' => new ExpenseResource($expense),
        ]);
    }

    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->expenses->stats(),
        ]);
    }

    public function archive(Request $request, Expense $expense): JsonResponse
    {
        $this->expenses->delete($expense, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Expense archived.',
            'data' => null,
        ]);
    }

    // Route is registered with ->withTrashed(), so $expense resolves even
    // though it's soft-deleted — same pattern as UserController::restore().
    public function restore(Request $request, Expense $expense): JsonResponse
    {
        $expense = $this->expenses->restore($expense, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Expense restored.',
            'data' => new ExpenseResource($expense),
        ]);
    }

    public function approve(Request $request, Expense $expense): JsonResponse
    {
        try {
            $expense = $this->expenses->approve($expense, $request->user());
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Expense approved.',
            'data' => new ExpenseResource($expense),
        ]);
    }

    public function reject(Request $request, Expense $expense): JsonResponse
    {
        $request->validate(['remarks' => ['nullable', 'string', 'max:500']]);

        try {
            $expense = $this->expenses->reject($expense, $request->input('remarks'));
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Expense rejected.',
            'data' => new ExpenseResource($expense),
        ]);
    }
}