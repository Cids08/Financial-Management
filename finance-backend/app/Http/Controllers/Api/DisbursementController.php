<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDisbursementRequest;
use App\Http\Requests\StorePayrollDisbursementRequest;
use App\Http\Requests\UpdateDisbursementRequest;
use App\Http\Requests\UploadDisbursementProofRequest;
use App\Http\Resources\DisbursementResource;
use App\Models\Disbursement;
use App\Models\SupportingDocument;
use App\Services\DisbursementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DisbursementController extends Controller
{
    public function __construct(private DisbursementService $disbursements)
    {
    }

    public function stats(Request $request)
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->disbursements->stats(),
        ]);
    }

    // NEW: lets the Add Disbursement form show the voucher number that
    // will (very likely) be assigned, before the user actually saves —
    // see DisbursementService::previewNextVoucherNumber()'s own comment
    // for why this is a preview and not a guarantee. Registered in
    // routes/api.php ABOVE the /{disbursement} show route, since
    // "next-voucher-number" would otherwise be swallowed by that route's
    // {disbursement} parameter.
    public function nextVoucherNumber(Request $request)
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => ['voucher_number' => $this->disbursements->previewNextVoucherNumber()],
        ]);
    }

    public function index(Request $request)
    {
        // Was previously only forwarding ['status', 'department_id',
        // 'search'] even though the service already supports 'archived',
        // 'date_from', and 'date_to' — those filters were silently
        // no-ops from the frontend. 'source_type' added for the AP vs
        // Payroll filter.
        $disbursements = $this->disbursements->paginate(
            $request->only(['status', 'source_type', 'department_id', 'search', 'archived', 'date_from', 'date_to', 'ap_id']),
            (int) $request->input('per_page', 20)
        );

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => DisbursementResource::collection($disbursements),
            'meta' => [
                'current_page' => $disbursements->currentPage(),
                'last_page' => $disbursements->lastPage(),
                'total' => $disbursements->total(),
            ],
        ]);
    }

    public function store(StoreDisbursementRequest $request)
    {
        $disbursement = $this->disbursements->create($request->validated(), $request->user()->id);

        if ($request->hasFile('proof')) {
            $this->disbursements->attachDocument($disbursement, $request->file('proof'), $request->user()->id);
        }

        return response()->json([
            'success' => true,
            'message' => 'Disbursement created and is pending approval.',
            'data' => new DisbursementResource($disbursement->load(['accountsPayable', 'department', 'cashAccount', 'creator'])),
        ], 201);
    }

    /**
     * Inbound API for external subsystems (HR / Payroll Subsystem).
     * Receives computed payroll batches and generates a pending disbursement voucher.
     */
    public function storePayroll(StorePayrollDisbursementRequest $request): JsonResponse
    {
        $data = $request->validated();

        // If cash_account_id was not specified by the external subsystem,
        // assign the primary active checking/cash account as default.
        if (empty($data['cash_account_id'])) {
            $defaultCash = \App\Models\CashAccount::where('status', 'Active')->where('account_type', 'Checking')->first()
                ?? \App\Models\CashAccount::where('status', 'Active')->first();

            if (! $defaultCash) {
                return response()->json([
                    'success' => false,
                    'message' => 'No active cash account is configured in Finance to assign to this payroll disbursement.',
                ], 422);
            }
            $data['cash_account_id'] = $defaultCash->id;
        }

        $userId = $request->user()?->id ?? 1;
        $disbursement = $this->disbursements->createPayrollRequest($data, $userId);

        // Notify Finance approvers and managers of the incoming payroll request
        try {
            $approverIds = \App\Models\User::whereHas('role.permissions', function ($q) {
                $q->whereIn('name', ['disbursements.approve', 'disbursements.manage']);
            })->orWhereHas('role', function ($q) {
                $q->whereIn('name', ['Admin', 'Super Admin', 'Finance Manager', 'super-admin']);
            })->pluck('id');

            if ($approverIds->isNotEmpty()) {
                $notifService = app(\App\Services\NotificationService::class);
                $formattedAmount = number_format((float) $disbursement->amount_paid, 2);
                $notifService->createForMany(
                    $approverIds,
                    'disbursement',
                    'New Payroll Request Submitted',
                    "Payroll request {$disbursement->payroll_batch_number} ({$disbursement->payee}) for PHP {$formattedAmount} has been submitted from HR/Payroll and is awaiting review."
                );
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning("Failed to dispatch payroll notification: {$e->getMessage()}");
        }

        return response()->json([
            'success' => true,
            'message' => "Payroll request {$disbursement->payroll_batch_number} received successfully and is pending approval.",
            'data' => new DisbursementResource($disbursement->load(['department', 'cashAccount', 'creator'])),
        ], 201);
    }

    public function show(Disbursement $disbursement)
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => new DisbursementResource(
                $disbursement->load(['accountsPayable', 'department', 'cashAccount', 'creator', 'approver', 'releaser'])
            ),
        ]);
    }

    public function update(UpdateDisbursementRequest $request, Disbursement $disbursement)
    {
        $disbursement = $this->disbursements->update($disbursement, $request->validated(), $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Disbursement updated.',
            'data' => new DisbursementResource($disbursement->load(['accountsPayable', 'department', 'cashAccount', 'creator', 'approver'])),
        ]);
    }

    public function uploadProof(UploadDisbursementProofRequest $request, Disbursement $disbursement)
    {
        $this->disbursements->attachDocument($disbursement, $request->file('proof'), $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Proof of payment attached.',
            'data' => new DisbursementResource($disbursement->fresh()->load(['accountsPayable', 'department', 'cashAccount', 'creator', 'approver'])),
        ]);
    }

    /**
     * GET /api/disbursements/{disbursement}/proof
     * Return the full proof-of-payment upload history for a disbursement, newest first.
     */
    public function proofHistory(Disbursement $disbursement): JsonResponse
    {
        $documents = $this->disbursements->getProofHistory($disbursement);

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
     * GET /api/disbursements/{disbursement}/proof/{document}/view
     * Serve a specific proof version inline so the browser can render
     * PDFs and images natively in a new tab.
     */
    public function viewProof(Disbursement $disbursement, SupportingDocument $document): BinaryFileResponse
    {
        if ($document->reference_type !== 'disbursement' || (int) $document->reference_id !== $disbursement->id) {
            abort(404, 'This document does not belong to this disbursement.');
        }

        if (! $document->storage_path) {
            abort(404, 'No file stored for this proof version.');
        }

        $fullPath = Storage::disk('local')->path($document->storage_path);

        return response()->file($fullPath, [
            'Content-Type' => $document->mime_type ?? 'application/octet-stream',
        ]);
    }

    // Gated by permission:disbursements.approve — see routes/api.php.
    // Applies identically to AP and payroll disbursements.
    public function approve(Request $request, Disbursement $disbursement)
    {
        $disbursement = $this->disbursements->approve($disbursement, $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Disbursement approved.',
            'data' => new DisbursementResource($disbursement->load(['accountsPayable', 'department', 'cashAccount', 'creator', 'approver'])),
        ]);
    }

    public function reject(Request $request, Disbursement $disbursement)
    {
        $request->validate(['reason' => ['nullable', 'string', 'max:2000']]);

        $disbursement = $this->disbursements->reject($disbursement, $request->user()->id, $request->input('reason'));

        return response()->json([
            'success' => true,
            'message' => 'Disbursement rejected.',
            'data' => new DisbursementResource($disbursement->load(['accountsPayable', 'department', 'cashAccount', 'creator', 'approver'])),
        ]);
    }

    // Also gated by permission:disbursements.approve — releasing funds is at
    // least as sensitive as approving them, and no separate "release"
    // permission was seeded (see comment in routes/api.php). Branches
    // internally on source_type (AP settlement vs payroll settlement) —
    // see DisbursementService::release().
    public function release(Request $request, Disbursement $disbursement)
    {
        $disbursement = $this->disbursements->release($disbursement, $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Disbursement released.',
            'data' => new DisbursementResource(
                $disbursement->load(['accountsPayable', 'department', 'cashAccount', 'creator', 'approver', 'releaser'])
            ),
        ]);
    }

    public function archive(Request $request, Disbursement $disbursement)
    {
        $this->disbursements->archive($disbursement, $request->user()->id);

        return response()->json(['success' => true, 'message' => 'Disbursement archived.', 'data' => null]);
    }

    public function restore(Request $request, Disbursement $disbursement)
    {
        $disbursement = $this->disbursements->restore($disbursement, $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Disbursement restored.',
            'data' => new DisbursementResource($disbursement->load(['accountsPayable', 'department', 'cashAccount', 'creator', 'approver'])),
        ]);
    }

    /**
     * GET /api/disbursements/{disbursement}/printable-voucher
     * Returns rich data for Check & Disbursement Voucher generation.
     */
    public function printableVoucher(Disbursement $disbursement): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $this->disbursements->getPrintableVoucher($disbursement),
        ]);
    }

    /**
     * GET /api/disbursements/{disbursement}/bir-2307
     * Returns official BIR Form 2307 calculation and withholding data.
     */
    public function bir2307Data(Disbursement $disbursement): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $this->disbursements->getBir2307Data($disbursement),
        ]);
    }
}