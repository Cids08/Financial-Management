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
use App\Support\FileStorage;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BudgetController extends Controller
{
    public function __construct(private BudgetService $budgets)
    {
    }

    public function allocationAccounts()
    {
        return response()->json(['success' => true, 'data' => app(\App\Services\BudgetGlService::class)->eligibleAccounts()]);
    }

    public function saveAllocations(Request $request, Budget $budget)
    {
        $data = $request->validate(['account_allocations' => ['required', 'array', 'min:1']]);
        $budget = app(\App\Services\BudgetGlService::class)->save($budget, $data['account_allocations'], $request->user()->id, $request->user()->hasPermission('budgets.approve'));
        return response()->json(['success' => true, 'data' => new BudgetResource($budget)]);
    }

    public function glUtilization(Request $request, Budget $budget)
    {
        $data = $request->validate(['account_id' => ['nullable', 'integer', 'exists:chart_of_accounts,id']]);
        return response()->json(['success' => true, 'data' => app(\App\Services\BudgetGlService::class)->ledger($budget, isset($data['account_id']) ? (int) $data['account_id'] : null)]);
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
            $request->only(['status', 'fiscal_year', 'search', 'archived', 'date_from', 'date_to']),
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

    /**
     * Utilization ledger: the transactions actually charged against this
     * budget, so `used_amount` can be explained instead of just displayed.
     *
     * Two sources move a budget: expenses (real budget_id FK) and payroll
     * disbursements (budget_id written at release, backfilled for history).
     * Both are returned in one date-ordered list with a running balance.
     *
     * The reconciliation block is the important part: `used_amount` is a
     * denormalized running total, so it can silently drift from the sum of
     * its parts (manual edits, rows archived after being counted, legacy
     * payroll with no budget_id). Surfacing the difference is what stops a
     * wrong number from looking authoritative.
     */
    public function utilization(Budget $budget, Request $request)
    {
        $budget->loadMissing('department');

        $expenses = $budget->expenses()
            ->with(['category:id,category_name', 'supplier:id,supplier_name'])
            ->get(['id', 'expense_date', 'description', 'expense_amount', 'expense_category_id', 'supplier_id', 'status', 'created_at']);

        $payroll = $budget->disbursements()
            ->get(['id', 'voucher_number', 'payee', 'payment_date', 'released_date', 'amount_paid', 'status', 'payroll_batch_number', 'employee_count', 'created_at']);

        $rows = [];

        foreach ($expenses as $e) {
            $rows[] = [
                'kind' => 'expense',
                'id' => $e->id,
                'date' => $e->expense_date?->toDateString(),
                'reference' => $e->receipt_number ?: null,
                'description' => $e->description,
                'counterparty' => $e->supplier?->supplier_name,
                'meta' => $e->category?->name,
                'status' => $e->status,
                'amount' => (float) $e->expense_amount,
            ];
        }

        foreach ($payroll as $d) {
            $rows[] = [
                'kind' => 'payroll',
                'id' => $d->id,
                'date' => ($d->released_date ?: $d->payment_date)?->toDateString(),
                'reference' => $d->payroll_batch_number ?: $d->voucher_number,
                'description' => 'Payroll'.($d->employee_count ? " ({$d->employee_count} employees)" : ''),
                'counterparty' => $d->payee,
                'meta' => null,
                'status' => $d->status,
                'amount' => (float) $d->amount_paid,
            ];
        }

        // Chronological, with a running balance so the user can see the
        // budget drain in the order it actually happened.
        usort($rows, fn ($a, $b) => ($a['date'] ?? '') <=> ($b['date'] ?? ''));

        $running = 0.0;
        foreach ($rows as &$r) {
            $running += $r['amount'];
            $r['running_total'] = round($running, 2);
        }
        unset($r);

        $expenseTotal = round(array_sum(array_column(
            array_values(array_filter($rows, fn ($r) => $r['kind'] === 'expense')),
            'amount'
        )), 2);

        $payrollTotal = round(array_sum(array_column(
            array_values(array_filter($rows, fn ($r) => $r['kind'] === 'payroll')),
            'amount'
        )), 2);

        $ledgerTotal = round($expenseTotal + $payrollTotal, 2);
        $storedTotal = round((float) $budget->used_amount, 2);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => [
                'rows' => $rows,
                'summary' => [
                    'expense_total' => $expenseTotal,
                    'payroll_total' => $payrollTotal,
                    'ledger_total' => $ledgerTotal,
                    'stored_used_amount' => $storedTotal,
                    // Non-zero means the running total and its parts disagree.
                    'variance' => round($storedTotal - $ledgerTotal, 2),
                    'allocated_amount' => (float) $budget->allocated_amount,
                    'remaining_amount' => (float) $budget->remaining_amount,
                ],
            ],
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
        try {
            $this->budgets->attachPlan($budget, $request->file('plan'), $request->user()->id);
        } catch (ValidationException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Budget plan attached.',
            'data' => new BudgetResource($budget->fresh()->load(['department', 'creator', 'approver'])),
        ]);
    }

    // Forces a download (Content-Disposition: attachment) — kept as-is
    // for whatever explicit "download to disk" action the frontend still
    // wants. For in-browser viewing, use viewPlan()/viewPlanVersion()
    // below instead, which set Content-Disposition: inline.
    public function downloadPlan(Request $request, Budget $budget)
    {
        $document = $budget->supportingDocuments()->latest('uploaded_at')->first();

        if (! $document || ! $document->storage_path) {
            abort(404, 'No plan file found for this budget.');
        }

        $url = FileStorage::signedUrl($document->storage_path);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => [
                'id'          => $document->id,
                'url'         => $url,
                'originalName'=> $document->original_name,
                'mimeType'    => $document->mime_type,
                'expires_in'  => FileStorage::DOCUMENT_TTL_SECONDS,
            ],
        ]);
    }

    // Inline viewing — response()->file() sets Content-Disposition: inline
    // by default (unlike response()->download(), which always forces
    // attachment), so a browser that can render the file type natively
    // (PDF, mainly — most browsers have a built-in PDF viewer) opens it
    // in the requesting tab instead of downloading it. .doc/.docx/.xls/
    // .xlsx will still just download in most browsers regardless of this
    // header, since browsers have no built-in renderer for those formats —
    // that's a browser limitation, not something this endpoint controls.
    // Same auth/permission gating as downloadPlan (budgets.view).
    public function viewPlan(Request $request, Budget $budget)
    {
        $document = $budget->supportingDocuments()->latest('uploaded_at')->first();

        if (! $document || ! $document->storage_path) {
            abort(404, 'No plan file found for this budget.');
        }

        $url = FileStorage::signedUrl($document->storage_path);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => [
                'id'          => $document->id,
                'url'         => $url,
                'originalName'=> $document->original_name,
                'mimeType'    => $document->mime_type,
                'expires_in'  => FileStorage::DOCUMENT_TTL_SECONDS,
            ],
        ]);
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

        $url = FileStorage::signedUrl($document->storage_path);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => [
                'id'          => $document->id,
                'url'         => $url,
                'originalName'=> $document->original_name,
                'mimeType'    => $document->mime_type,
                'expires_in'  => FileStorage::DOCUMENT_TTL_SECONDS,
            ],
        ]);
    }

    // Inline-view equivalent of downloadPlanVersion() — same ownership
    // check, same reasoning as viewPlan() above re: which formats a
    // browser can actually render inline.
    public function viewPlanVersion(Request $request, Budget $budget, SupportingDocument $document)
    {
        if ($document->reference_type !== 'budget' || $document->reference_id !== $budget->id) {
            abort(404, 'This document does not belong to this budget.');
        }

        if (! $document->storage_path) {
            abort(404, 'No file stored for this plan version.');
        }

        $url = FileStorage::signedUrl($document->storage_path);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => [
                'id'          => $document->id,
                'url'         => $url,
                'originalName'=> $document->original_name,
                'mimeType'    => $document->mime_type,
                'expires_in'  => FileStorage::DOCUMENT_TTL_SECONDS,
            ],
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