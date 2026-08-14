<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GeneralLedgerFilterRequest;
use App\Http\Resources\ChartOfAccountResource;
use App\Http\Resources\JournalEntryLineResource;
use App\Services\GeneralLedgerService;
use Illuminate\Http\JsonResponse;

class GeneralLedgerController extends Controller
{
    public function __construct(private readonly GeneralLedgerService $ledger)
    {
    }

    /** GET /api/general-ledger/lines */
    public function lines(GeneralLedgerFilterRequest $request): JsonResponse
    {
        $lines = $this->ledger->getLines($request->validated());

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => JournalEntryLineResource::collection($lines->items()),
            'meta' => [
                'current_page' => $lines->currentPage(),
                'last_page' => $lines->lastPage(),
                'per_page' => $lines->perPage(),
                'total' => $lines->total(),
                'grand_totals' => $this->ledger->getGrandTotals(),
            ],
        ]);
    }

    /** GET /api/general-ledger/trial-balance */
    public function trialBalance(GeneralLedgerFilterRequest $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->ledger->getTrialBalance($request->validated()),
        ]);
    }

    /** GET /api/general-ledger/entries/{journalEntry} */
    public function entryDetail(int $journalEntry): JsonResponse
    {
        $entry = $this->ledger->getEntryWithLines($journalEntry);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => [
                'id' => $entry->id,
                'transaction_no' => $entry->transaction_no,
                'transaction_date' => $entry->transaction_date?->format('Y-m-d'),
                'description' => $entry->description,
                'status' => $entry->status,
                'is_balanced' => $entry->is_balanced,
                'lines' => $entry->lines->map(fn ($line) => [
                    'id' => $line->id,
                    'account_code' => $line->account->account_code,
                    'account_name' => $line->account->account_name,
                    'debit' => (float) $line->debit,
                    'credit' => (float) $line->credit,
                    'remarks' => $line->remarks,
                    'created_at' => $line->created_at?->toIso8601String(),
                ]),
            ],
        ]);
    }

    /** GET /api/chart-of-accounts */
    public function accounts(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => ChartOfAccountResource::collection($this->ledger->getActiveAccounts()),
        ]);
    }
}