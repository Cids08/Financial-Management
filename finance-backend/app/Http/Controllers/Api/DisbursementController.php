<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDisbursementRequest;
use App\Http\Requests\UpdateDisbursementRequest;
use App\Http\Requests\UploadDisbursementProofRequest;
use App\Http\Resources\DisbursementResource;
use App\Models\Disbursement;
use App\Services\DisbursementService;
use Illuminate\Http\Request;

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

    public function index(Request $request)
    {
        $disbursements = $this->disbursements->paginate(
            $request->only(['status', 'department_id', 'search']),
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

        return response()->json([
            'success' => true,
            'message' => 'Disbursement created and is pending approval.',
            'data' => new DisbursementResource($disbursement->load(['accountsPayable', 'department', 'cashAccount', 'creator'])),
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

    // Gated by permission:disbursements.approve — see routes/api.php.
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
    // permission was seeded (see comment in routes/api.php).
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
}