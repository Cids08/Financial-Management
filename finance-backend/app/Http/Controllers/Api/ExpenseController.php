<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RejectExpenseRequest;
use App\Http\Requests\StoreExpenseRequest;
use App\Http\Requests\UpdateExpenseRequest;
use App\Http\Requests\UploadExpenseReceiptRequest;
use App\Http\Resources\ExpenseResource;
use App\Models\Expense;
use App\Models\SupportingDocument;
use App\Services\ExpenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

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
            'expense_date_from' => $request->query('expense_date_from'),
            'expense_date_to' => $request->query('expense_date_to'),
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
        $expense->load(['budget:id,budget_name', 'category:id,category_name', 'supplier:id,supplier_name', 'creator:id,first_name,last_name', 'deleter:id,first_name,last_name', 'taxObligations.createdBy']);

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
        $this->authorize('archive', $expense);

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
        $this->authorize('restore', $expense);

        $expense = $this->expenses->restore($expense, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Expense restored.',
            'data' => new ExpenseResource($expense),
        ]);
    }

    public function approve(Request $request, Expense $expense): JsonResponse
    {
        $this->authorize('approve', $expense);

        // Super Admin / Admin bypass the filer-department-must-match-
        // budget-department check — same override tier that already
        // short-circuits hasPermission() to true everywhere else (see
        // User::hasPermission()'s SUPER_ADMIN_ROLE handling and
        // ExpensePolicy's docblock). This is the SAME $skipDepartmentCheck
        // flag TaxObligationService::recordAsExpense() uses for its own
        // system-generated posting — two different callers, same
        // reasoning: "who happens to be approving/posting this" has no
        // bearing on whether the filer's department genuinely doesn't
        // match the budget's, in either case.
        $isAdminOverride = $request->user()->hasAnyRole(['super-admin', 'admin']);

        try {
            $expense = $this->expenses->approve($expense, $request->user(), skipDepartmentCheck: $isAdminOverride);
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

    public function reject(RejectExpenseRequest $request, Expense $expense): JsonResponse
    {
        try {
            $expense = $this->expenses->reject($expense, $request->validated('remarks'));
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

    /**
     * POST /api/expenses/{expense}/receipt
     * Attach a receipt document. Re-uploading adds a new version; it does
     * not replace the previous one (history is preserved). Mirrors
     * CollectionController::attachProof() exactly: the Form Request's own
     * authorize() is a stub (route middleware only) — this explicit
     * Policy check is the real gate, same two-layer pattern Collection
     * uses for its proof endpoint.
     */
    public function uploadReceipt(UploadExpenseReceiptRequest $request, Expense $expense): JsonResponse
    {
        $this->authorize('update', $expense);

        try {
            $document = $this->expenses->attachReceipt($expense, $request->file('receipt'), $request->user());
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Receipt uploaded.',
            'data' => [
                'id' => $document->id,
                'original_name' => $document->original_name,
                'file_size' => $document->file_size,
                'mime_type' => $document->mime_type,
                'uploaded_at' => $document->uploaded_at?->toIso8601String(),
                'has_file' => true,
            ],
        ], 201);
    }

    /**
     * GET /api/expenses/{expense}/receipts
     * Full upload history, newest first. Mirrors
     * CollectionController::proofHistory() exactly, including the
     * inline array shape — there's no SupportingDocumentResource class
     * in this codebase to delegate to.
     */
    public function receiptHistory(Expense $expense): JsonResponse
    {
        $this->authorize('view', $expense);

        $documents = $this->expenses->getReceiptHistory($expense);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $documents->map(fn ($doc) => [
                'id' => $doc->id,
                'original_name' => $doc->original_name,
                'file_size' => $doc->file_size,
                'mime_type' => $doc->mime_type,
                'uploaded_at' => $doc->uploaded_at?->toIso8601String(),
                'uploaded_by_name' => $doc->uploaded_by_name,
                'has_file' => $doc->has_file,
            ]),
        ]);
    }

    /**
     * GET /api/expenses/{expense}/receipt/view
     * Serve the CURRENT (most recently uploaded) receipt inline — the
     * singular counterpart to receiptHistory()'s plural list, mirroring
     * Budget's /plan vs /plans/{document} split exactly.
     */
    public function viewReceipt(Expense $expense): BinaryFileResponse
    {
        $this->authorize('view', $expense);

        $document = $this->expenses->getCurrentReceipt($expense);

        if (! $document || ! $document->storage_path) {
            abort(404, 'No receipt has been attached to this expense yet.');
        }

        $fullPath = Storage::disk('local')->path($document->storage_path);

        return response()->file($fullPath, [
            'Content-Type' => $document->mime_type ?? 'application/octet-stream',
        ]);
    }

    /**
     * GET /api/expenses/{expense}/receipts/{document}/view
     * Serve a SPECIFIC historical receipt version inline, by document id —
     * the plural counterpart to viewReceipt()'s "current" endpoint.
     * Mirrors CollectionController::viewProof() exactly, including the
     * reference_type + reference_id ownership check — supporting_documents
     * is a shared table across Budget/Collection/Expense, so this is what
     * stops someone guessing a document ID that belongs to a different
     * module or a different expense entirely.
     */
    public function viewReceiptVersion(Expense $expense, SupportingDocument $document): BinaryFileResponse
    {
        $this->authorize('view', $expense);

        if ($document->reference_type !== 'expense' || (int) $document->reference_id !== $expense->id) {
            abort(404, 'This document does not belong to this expense.');
        }

        if (! $document->storage_path) {
            abort(404, 'No file stored for this receipt version.');
        }

        $fullPath = Storage::disk('local')->path($document->storage_path);

        return response()->file($fullPath, [
            'Content-Type' => $document->mime_type ?? 'application/octet-stream',
        ]);
    }
}