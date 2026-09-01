<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBudgetRequest;
use App\Http\Requests\UpdateBudgetRequest;
use App\Http\Requests\UploadBudgetPlanRequest;
use App\Http\Resources\BudgetResource;
use App\Models\Budget;
use App\Models\SupportingDocument;
use App\Services\BudgetService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
            'data' => $this->budgets->stats(),
        ]);
    }

    public function index(Request $request)
    {
        // Fix: 'approval_status' and 'archived' are now whitelisted — they
        // were previously dropped by $request->only() before ever reaching
        // BudgetService::paginate(), so the frontend's approval filter and
        // "Show Archived" toggle were silently no-ops.
        $budgets = $this->budgets->paginate(
            $request->only(['status', 'fiscal_year', 'search', 'archived']),
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

    // Lets an admin actually open/download the attached plan file to
    // review it before approving — has_plan only told them ONE exists,
    // not what's in it. Gated by budgets.view, not .manage, since
    // reviewing a plan is part of deciding whether to approve it.
    // Kept as "download the latest" for the quick one-click action in the
    // table/detail view — see planHistory()/downloadPlanVersion() below
    // for the full version history.
    public function downloadPlan(Request $request, Budget $budget)
    {
        $document = $budget->supportingDocuments()->latest('uploaded_at')->first();

        if (! $document || ! $document->storage_path) {
            abort(404, 'No plan file found for this budget.');
        }

        $fullPath = Storage::disk('local')->path($document->storage_path);

        return response()->download($fullPath, $document->original_name);
    }

    // Every plan ever attached to this budget, newest first — a re-upload
    // doesn't delete the previous version, it just adds another
    // supporting_documents row, so nothing is lost by attaching a
    // correction. Gated the same as downloadPlan (budgets.view).
    public function planHistory(Budget $budget)
    {
        $documents = $budget->supportingDocuments()
            ->with('uploader')
            ->latest('uploaded_at')
            ->get();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $documents->map(fn ($doc) => [
                'id' => $doc->id,
                'original_name' => $doc->original_name,
                'file_size' => $doc->file_size,
                'uploaded_at' => $doc->uploaded_at?->toIso8601String(),
                'uploaded_by_name' => $doc->uploader
                    ? trim(($doc->uploader->first_name ?? '').' '.($doc->uploader->last_name ?? ''))
                    : null,
                'has_file' => (bool) $doc->storage_path,
            ]),
        ]);
    }

    // Downloads one SPECIFIC version by supporting_documents.id, not just
    // the latest. The reference_type/reference_id check matters: without
    // it, anyone who can view ANY budget's plan could download a document
    // by guessing/iterating IDs that actually belong to a different
    // budget (or a different module entirely, since supporting_documents
    // is shared across budgets, disbursements, etc).
    public function downloadPlanVersion(Request $request, Budget $budget, SupportingDocument $document)
    {
        if ($document->reference_type !== 'budget' || $document->reference_id !== $budget->id) {
            abort(404, 'This document does not belong to this budget.');
        }

        if (! $document->storage_path) {
            abort(404, 'No file stored for this plan version.');
        }

        $fullPath = Storage::disk('local')->path($document->storage_path);

        return response()->download($fullPath, $document->original_name);
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