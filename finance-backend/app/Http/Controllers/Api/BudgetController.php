<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBudgetRequest;
use App\Http\Requests\UpdateBudgetRequest;
use App\Http\Requests\UploadBudgetPlanRequest;
use App\Http\Resources\BudgetResource;
use App\Models\Budget;
use App\Services\BudgetService;
use Illuminate\Http\Request;

class BudgetController extends Controller
{
    public function __construct(private BudgetService $budgets)
    {
    }

    public function stats(Request $request)
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => [
                'total' => Budget::query()->count(),
            ],
        ]);
    }

    public function index(Request $request)
    {
        $budgets = $this->budgets->paginate(
            $request->only(['status', 'fiscal_year', 'search']),
            (int) $request->input('per_page', 20)
        );

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => BudgetResource::collection($budgets),
            'meta' => [
                'current_page' => $budgets->currentPage(),
                'last_page' => $budgets->lastPage(),
                'total' => $budgets->total(),
            ],
        ]);
    }

    public function store(StoreBudgetRequest $request)
    {
        $budget = $this->budgets->create($request->validated(), $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Budget created and is pending approval.',
            'data' => new BudgetResource($budget->load(['department', 'creator'])),
        ], 201);
    }

    public function show(Budget $budget)
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => new BudgetResource($budget->load(['department', 'creator', 'approver'])),
        ]);
    }

    public function update(UpdateBudgetRequest $request, Budget $budget)
    {
        $budget = $this->budgets->update($budget, $request->validated(), $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Budget updated.',
            'data' => new BudgetResource($budget->load(['department', 'creator', 'approver'])),
        ]);
    }

    public function uploadPlan(UploadBudgetPlanRequest $request, Budget $budget)
    {
        $this->budgets->attachPlan($budget, $request->file('plan'), $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Budget plan attached.',
            'data' => new BudgetResource($budget->fresh()->load(['department', 'creator', 'approver'])),
        ]);
    }

    // Route-gated by permission:budgets.approve — see routes/api.php. The
    // has_plan check itself lives in BudgetService::approve(), which is the
    // actual enforcement point regardless of who calls it.
    public function approve(Request $request, Budget $budget)
    {
        $budget = $this->budgets->approve($budget, $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Budget approved.',
            'data' => new BudgetResource($budget->load(['department', 'creator', 'approver'])),
        ]);
    }

    public function reject(Request $request, Budget $budget)
    {
        $request->validate(['reason' => ['nullable', 'string', 'max:2000']]);

        $budget = $this->budgets->reject($budget, $request->user()->id, $request->input('reason'));

        return response()->json([
            'success' => true,
            'message' => 'Budget rejected.',
            'data' => new BudgetResource($budget->load(['department', 'creator', 'approver'])),
        ]);
    }

    public function archive(Request $request, Budget $budget)
    {
        $this->budgets->archive($budget, $request->user()->id);

        return response()->json(['success' => true, 'message' => 'Budget archived.', 'data' => null]);
    }

    public function restore(Request $request, Budget $budget)
    {
        $budget = $this->budgets->restore($budget, $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Budget restored.',
            'data' => new BudgetResource($budget->load(['department', 'creator', 'approver'])),
        ]);
    }
}