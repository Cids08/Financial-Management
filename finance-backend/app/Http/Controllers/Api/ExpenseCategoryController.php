<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExpenseCategoryRequest;
use App\Http\Requests\UpdateExpenseCategoryRequest;
use App\Http\Resources\ExpenseCategoryResource;
use App\Models\ExpenseCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExpenseCategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
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
        $category = ExpenseCategory::create([
            ...$request->validated(),
            'is_active' => $request->boolean('is_active', true),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Expense category created.',
            'data' => new ExpenseCategoryResource($category),
        ], 201);
    }

    public function update(UpdateExpenseCategoryRequest $request, ExpenseCategory $expenseCategory): JsonResponse
    {
        $expenseCategory->update($request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Expense category updated.',
            'data' => new ExpenseCategoryResource($expenseCategory),
        ]);
    }

    public function archive(ExpenseCategory $expenseCategory): JsonResponse
    {
        $expenseCategory->delete();

        return response()->json([
            'success' => true,
            'message' => 'Expense category archived.',
            'data' => null,
        ]);
    }

    public function restore(ExpenseCategory $expenseCategory): JsonResponse
    {
        $expenseCategory->restore();

        return response()->json([
            'success' => true,
            'message' => 'Expense category restored.',
            'data' => new ExpenseCategoryResource($expenseCategory),
        ]);
    }
}