<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccountsReceivableRequest;
use App\Http\Requests\UpdateAccountsReceivableRequest;
use App\Http\Requests\UploadAccountsReceivableDocumentRequest;
use App\Http\Resources\AccountsReceivableResource;
use App\Models\AccountsReceivable;
use App\Models\SupportingDocument;
use App\Services\AccountsReceivableService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AccountsReceivableController extends Controller
{
    public function __construct(protected AccountsReceivableService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = [
            'status' => $request->query('status'),
            'search' => $request->query('search'),
        ];

        if ($request->has('archived')) {
            $filters['archived'] = filter_var($request->query('archived'), FILTER_VALIDATE_BOOLEAN);
        }

        $user = $request->user();

        // A Collector may only ever see AR assigned to them. Forced here
        // rather than trusting any client-supplied value — this is an
        // authorization boundary, not a convenience filter. The collector
        // role is granted ar.view by default (RolesAndPermissionsSeeder),
        // so without this every collector would see every customer's
        // receivables, not just their own.
        if ($user->hasRole('collector')) {
            $ownCollectorId = $user->collector?->id;

            // Fail closed: an unlinked Collector-role account sees
            // nothing, not everything.
            if ($ownCollectorId === null) {
                return response()->json([
                    'success' => true,
                    'message' => '',
                    'data' => [],
                ]);
            }

            $filters['collector_id'] = $ownCollectorId;
        }

        $records = $this->service->list($filters);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => AccountsReceivableResource::collection($records),
        ]);
    }

    public function store(StoreAccountsReceivableRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $ar = $this->service->create($request->user(), $validated);

        if ($request->hasFile('document')) {
            $this->service->attachDocument($ar, $request->file('document'), $request->user());
        }

        return response()->json([
            'success' => true,
            'message' => 'Invoice created successfully.',
            'data' => new AccountsReceivableResource($ar->fresh(['customer', 'collector'])),
        ], 201);
    }

    public function update(UpdateAccountsReceivableRequest $request, AccountsReceivable $accountsReceivable): JsonResponse
    {
        $ar = $this->service->update($request->user(), $accountsReceivable, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Invoice updated successfully.',
            'data' => new AccountsReceivableResource($ar),
        ]);
    }

    /**
     * Single toggle endpoint — matches the frontend's one-button
     * archive/restore action rather than separate REST verbs.
     */
    public function toggleArchive(Request $request, AccountsReceivable $accountsReceivable): JsonResponse
    {
        if (! $request->user()->hasAnyRole(['admin', 'super-admin'])) {
            return response()->json([
                'success' => false,
                'message' => 'Only administrators are authorized to archive or restore invoices.',
            ], 403);
        }

        $ar = $this->service->toggleArchive($request->user(), $accountsReceivable);

        return response()->json([
            'success' => true,
            'message' => $ar->is_archived ? 'Invoice archived.' : 'Invoice restored.',
            'data' => new AccountsReceivableResource($ar),
        ]);
    }

    public function documentHistory(AccountsReceivable $accountsReceivable): JsonResponse
    {
        $documents = $this->service->getDocumentHistory($accountsReceivable);

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

    public function attachDocument(UploadAccountsReceivableDocumentRequest $request, AccountsReceivable $accountsReceivable): JsonResponse
    {
        $document = $this->service->attachDocument(
            $accountsReceivable,
            $request->file('document'),
            $request->user()
        );

        return response()->json([
            'success' => true,
            'message' => 'Supporting document attached successfully.',
            'data' => [
                'id' => $document->id,
                'original_name' => $document->original_name,
                'file_size' => $document->file_size,
                'mime_type' => $document->mime_type,
                'uploaded_at' => $document->uploaded_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function viewDocument(AccountsReceivable $accountsReceivable, SupportingDocument $document): BinaryFileResponse
    {
        if ($document->reference_type !== 'accounts_receivable' || (int) $document->reference_id !== $accountsReceivable->id) {
            abort(404, 'This document does not belong to this invoice.');
        }

        if (! $document->storage_path) {
            abort(404, 'No file stored for this document version.');
        }

        $fullPath = \Illuminate\Support\Facades\Storage::disk('local')->path($document->storage_path);

        return response()->file($fullPath, [
            'Content-Type' => $document->mime_type ?? 'application/octet-stream',
        ]);
    }

    /* ---------------------------------------------------------------------- */
    /* Aging & Statement of Account endpoints                                  */
    /* ---------------------------------------------------------------------- */

    /**
     * GET /accounts-receivable/aging-summary
     * Returns aging matrix for all customers with outstanding invoices.
     * Requires ar.view permission (same as invoice list).
     */
    public function agingSummary(Request $request): JsonResponse
    {
        $summary = $this->service->getAgingSummary();

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $summary,
        ]);
    }

    /**
     * GET /accounts-receivable/customer-soa/{customerId}
     * Returns full SOA for a single customer.
     * Requires ar.view permission.
     */
    public function customerSoa(Request $request, int $customerId): JsonResponse
    {
        $soa = $this->service->getStatementOfAccount($customerId);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $soa,
        ]);
    }

    /**
     * GET /accounts-receivable/soa-batch
     * Returns SOA for ALL customers with outstanding invoices (batch print).
     * Requires ar.manage or admin/super-admin — prevents collectors from
     * pulling all customers' financial data at once.
     */
    public function soaBatch(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->hasPermission('ar.manage') && ! $user->hasAnyRole(['admin', 'super-admin'])) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to generate batch statements.',
            ], 403);
        }

        $batch = $this->service->getBatchStatementOfAccounts();

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $batch,
        ]);
    }
}