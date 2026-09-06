<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccountsPayableRequest;
use App\Http\Requests\UpdateAccountsPayableRequest;
use App\Http\Requests\UploadAccountsPayableDocumentRequest;
use App\Http\Resources\AccountsPayableResource;
use App\Models\AccountsPayable;
use App\Models\SupportingDocument;
use App\Services\AccountsPayableService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountsPayableController extends Controller
{
    public function __construct(protected AccountsPayableService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', AccountsPayable::class);

        $archived = $request->boolean('archived');

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => AccountsPayableResource::collection($this->service->list($archived)),
        ]);
    }

    public function stats(): JsonResponse
    {
        $this->authorize('viewAny', AccountsPayable::class);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->service->stats(),
        ]);
    }

    public function store(StoreAccountsPayableRequest $request): JsonResponse
    {
        // authorize() also runs inside StoreAccountsPayableRequest, but it's
        // called here too for defense-in-depth / readability at the
        // controller level — cheap no-op if already authorized.
        $this->authorize('create', AccountsPayable::class);

        $bill = $this->service->create($request->user(), $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Bill created successfully.',
            'data' => new AccountsPayableResource($bill),
        ], 201);
    }

    public function update(UpdateAccountsPayableRequest $request, AccountsPayable $accountsPayable): JsonResponse
    {
        $this->authorize('update', $accountsPayable);

        $bill = $this->service->update($request->user(), $accountsPayable, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Bill updated successfully.',
            'data' => new AccountsPayableResource($bill),
        ]);
    }

    public function approve(Request $request, AccountsPayable $accountsPayable): JsonResponse
    {
        $this->authorize('approve', $accountsPayable);

        $bill = $this->service->approve($request->user(), $accountsPayable);

        return response()->json([
            'success' => true,
            'message' => 'Bill approved successfully.',
            'data' => new AccountsPayableResource($bill),
        ]);
    }

    public function archive(Request $request, AccountsPayable $accountsPayable): JsonResponse
    {
        $this->authorize('archive', $accountsPayable);

        $this->service->archive($request->user(), $accountsPayable);

        return response()->json([
            'success' => true,
            'message' => 'Bill archived successfully.',
        ]);
    }

    // {accountsPayable} must resolve a soft-deleted record — see routes,
    // needs withTrashed() same as the users restore route.
    public function restore(Request $request, AccountsPayable $accountsPayable): JsonResponse
    {
        $this->authorize('restore', $accountsPayable);

        $this->service->restore($request->user(), $accountsPayable);

        return response()->json([
            'success' => true,
            'message' => 'Bill restored successfully.',
        ]);
    }

    /**
     * POST /api/accounts-payable/{accountsPayable}/document
     * Attach a supporting document (invoice scan/photo). Re-uploading
     * adds a new version; it does not replace the previous one.
     *
     * Uses attachDocument (not update) for authorization — see
     * AccountsPayablePolicy::attachDocument() for why this is
     * deliberately not blocked on an approved/Paid/Cancelled bill.
     */
    public function attachDocument(UploadAccountsPayableDocumentRequest $request, AccountsPayable $accountsPayable): JsonResponse
    {
        $this->authorize('attachDocument', $accountsPayable);

        $document = $this->service->attachDocument(
            $accountsPayable,
            $request->file('document'),
            $request->user()
        );

        return response()->json([
            'success' => true,
            'message' => 'Document attached.',
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
     * GET /api/accounts-payable/{accountsPayable}/document
     * Full document upload history for a bill, newest first.
     */
    public function documentHistory(AccountsPayable $accountsPayable): JsonResponse
    {
        $this->authorize('view', $accountsPayable);

        $documents = $this->service->getDocumentHistory($accountsPayable);

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
     * GET /api/accounts-payable/{accountsPayable}/document/{document}/view
     * Serve a specific document version inline so the browser can render
     * PDFs/images natively in a new tab. Ownership check on
     * reference_type + reference_id mirrors
     * CollectionController::viewProof() / BudgetController::viewPlanVersion() —
     * prevents ID enumeration across modules since supporting_documents
     * is a shared table.
     */
    public function viewDocument(AccountsPayable $accountsPayable, SupportingDocument $document): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        $this->authorize('view', $accountsPayable);

        if ($document->reference_type !== 'accounts_payable' || (int) $document->reference_id !== $accountsPayable->id) {
            abort(404, 'This document does not belong to this bill.');
        }

        if (! $document->storage_path) {
            abort(404, 'No file stored for this document version.');
        }

        $fullPath = \Illuminate\Support\Facades\Storage::disk('local')->path($document->storage_path);

        return response()->file($fullPath, [
            'Content-Type' => $document->mime_type ?? 'application/octet-stream',
        ]);
    }
}