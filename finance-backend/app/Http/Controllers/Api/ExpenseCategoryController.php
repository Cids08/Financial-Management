<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExpenseCategoryRequest;
use App\Http\Requests\UpdateExpenseCategoryRequest;
use App\Http\Resources\ExpenseCategoryResource;
use App\Models\ExpenseCategory;
use App\Services\ExpenseCategoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExpenseCategoryController extends Controller
{
    public function __construct(private readonly ExpenseCategoryService $categories)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', ExpenseCategory::class);

        $query = ExpenseCategory::query()
            ->withCount('expenses')
            ->search($request->query('search'));

        if ($request->boolean('trashed')) {
            $query->onlyTrashed();
        }

        if ($request->has('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $categories = $query->orderBy('category_name')->get();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => ExpenseCategoryResource::collection($categories),
        ]);
    }

    public function store(StoreExpenseCategoryRequest $request): JsonResponse
    {
        $category = $this->categories->create($request->validated(), $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Expense category created.',
            'data' => new ExpenseCategoryResource($category),
        ], 201);
    }

    public function update(UpdateExpenseCategoryRequest $request, ExpenseCategory $expenseCategory): JsonResponse
    {
        $expenseCategory = $this->categories->update($expenseCategory, $request->validated(), $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Expense category updated.',
            'data' => new ExpenseCategoryResource($expenseCategory),
        ]);
    }

    public function archive(Request $request, ExpenseCategory $expenseCategory): JsonResponse
    {
        $this->authorize('archive', $expenseCategory);

        $this->categories->archive($expenseCategory, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Expense category archived.',
            'data' => null,
        ]);
    }

    public function restore(Request $request, ExpenseCategory $expenseCategory): JsonResponse
    {
        $this->authorize('restore', $expenseCategory);

        $expenseCategory = $this->categories->restore($expenseCategory, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Expense category restored.',
            'data' => new ExpenseCategoryResource($expenseCategory),
        ]);
    }
}