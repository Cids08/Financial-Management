<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\Collection;
use App\Models\Disbursement;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\SupportingDocument;
use App\Models\TaxObligation;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TaxObligationService
{
    protected const PER_PAGE = 15;

    // Fixed system budget/category tax payments post against. One-time
    // reference data — seed a Budget with this budget_code and an
    // ExpenseCategory with this category_code before the first tax
    // obligation is marked Paid.
    protected const TAX_BUDGET_CODE = 'STAT-COMPLIANCE';
    protected const TAX_CATEGORY_CODE = 'TAX';

    // Fields captured in AuditLog.old_values/new_values for create/update —
    // the obligation's actual financial and status data, not timestamps or
    // relationship ids that don't need a diff trail.
    protected const AUDITED_FIELDS = [
        'tax_type', 'tax_period', 'tax_rate', 'taxable_amount', 'tax_amount',
        'due_date', 'payment_date', 'reference_number', 'status', 'remarks',
    ];

    public function __construct(private readonly ExpenseService $expenseService)
    {
    }

    /**
     * @param array{search?: string, status?: string, archived?: bool} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = TaxObligation::query()->with(['createdBy', 'deletedBy', 'expense', 'cashAccount']);

        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        $query->search($filters['search'] ?? null)->latest('due_date');

        // "Overdue" is derived (Pending + due_date < today) rather than a
        // stored value, but it's still expressible in SQL, so filter here —
        // before pagination — instead of on an already-paginated page.
        // Filtering post-fetch made `total`/`last_page` in the response
        // meta reflect the unfiltered count while `data` held fewer rows,
        // which breaks pagination controls on the frontend the moment a
        // status filter is applied. Trashed obligations are always 'Paid'
        // or 'Pending' in practice, but a Paid record is never reclassified
        // regardless of due_date (see TaxObligation::derivedStatus()), so
        // the same rule is mirrored here.
        match ($filters['status'] ?? null) {
            'Paid' => $query->where('status', 'Paid'),
            'Pending' => $query->where('status', 'Pending')
                ->where('due_date', '>=', now()->toDateString()),
            'Overdue' => $query->where('status', 'Pending')
                ->where('due_date', '<', now()->toDateString()),
            default => null,
        };

        $paginated = $query->paginate(self::PER_PAGE);

        // has_document + latest_document_id: computed in ONE extra query
        // for the whole page, not per-row — avoids an N+1 against
        // supporting_documents. latest_document_id lets the frontend jump
        // straight to viewing the current file (a direct "View current
        // document" action) without opening History first to find its id.
        // Both set as plain dynamic properties; TaxObligationResource
        // reads them directly. Only meaningful on this list endpoint —
        // create/update/archive/restore responses don't set them, since
        // the frontend always refetches the list after any of those.
        $idsOnPage = $paginated->getCollection()->pluck('id');
        $latestDocumentByObligation = SupportingDocument::query()
            ->where('reference_type', 'tax_obligation')
            ->whereIn('reference_id', $idsOnPage)
            ->orderByDesc('uploaded_at')
            ->orderByDesc('id')
            ->get(['id', 'reference_id'])
            // unique() keeps the FIRST row per reference_id it encounters;
            // since the query above is already ordered newest-first, that
            // first row per obligation IS the latest document.
            ->unique('reference_id')
            ->keyBy('reference_id');

        $paginated->getCollection()->each(function (TaxObligation $obligation) use ($latestDocumentByObligation) {
            $latest = $latestDocumentByObligation->get($obligation->id);
            $obligation->has_document = (bool) $latest;
            $obligation->latest_document_id = $latest?->id;
        });

        return $paginated;
    }

    public function create(User $user, array $data): TaxObligation
    {
        return DB::transaction(function () use ($user, $data) {
            $isPaid = (bool) ($data['is_paid'] ?? false);

            $obligation = TaxObligation::create([
                ...$data,
                'tax_amount'       => $this->computeTaxAmount($data),
                'status'           => $isPaid ? 'Paid' : 'Pending',
                'payment_date'     => $isPaid ? ($data['payment_date'] ?? now()->toDateString()) : null,
                'reference_number' => $isPaid ? ($data['reference_number'] ?? null) : null,
                'created_by'       => $user->id,
            ]);

            if ($isPaid) {
                $obligation = $this->recordAsExpense($user, $obligation);
            }

            $this->logAudit($user, 'create', $obligation, null, $obligation->only(self::AUDITED_FIELDS));

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    public function update(User $user, TaxObligation $obligation, array $data): TaxObligation
    {
        return DB::transaction(function () use ($user, $obligation, $data) {
            if ($obligation->status === 'Paid') {
                throw ValidationException::withMessages([
                    'status' => 'Paid tax obligations cannot be edited. Archive the obligation if a correction is needed.',
                ]);
            }

            $wasPaid = $obligation->status === 'Paid';
            $isPaid = (bool) ($data['is_paid'] ?? false);
            $oldValues = $obligation->only(self::AUDITED_FIELDS);

            // Once this obligation's payment has already been posted as an
            // approved Expense (with a GL entry and budget usage already
            // applied), it must be treated the same way ExpenseService::update()
            // treats an Approved expense: frozen. Two failure modes matter here:
            //
            //  1. Un-checking "paid" would silently orphan the linked Expense
            //     instead of reversing it.
            //  2. Changing tax_type/tax_period/tax_rate/taxable_amount/due_date
            //     would change tax_amount on this record without touching the
            //     Expense (or its journal entries / budget usage) that were
            //     already posted from the old amount — the two records would
            //     silently drift out of sync.
            //
            // Both are blocked below. Archive the obligation (or, if truly
            // needed, adjust the linked Expense itself) rather than editing a
            // posted obligation in place.
            if ($obligation->expense_id) {
                $recomputedAmount = $this->computeTaxAmount($data);

                $isLocked = ! $isPaid
                    || $obligation->tax_type !== $data['tax_type']
                    || $obligation->tax_period !== $data['tax_period']
                    || (float) $obligation->tax_rate !== (float) $data['tax_rate']
                    || (float) $obligation->taxable_amount !== (float) $data['taxable_amount']
                    || $obligation->due_date->toDateString() !== $data['due_date']
                    || (float) $obligation->tax_amount !== $recomputedAmount;

                if ($isLocked) {
                    throw ValidationException::withMessages([
                        'is_paid' => 'This obligation is already recorded as a paid, approved expense and cannot be edited. Archive the obligation instead, or adjust the linked expense directly if a correction is truly needed.',
                    ]);
                }
            }

            $obligation->update([
                ...$data,
                'tax_amount'       => $this->computeTaxAmount($data),
                'status'           => $isPaid ? 'Paid' : 'Pending',
                'payment_date'     => $isPaid ? ($data['payment_date'] ?? now()->toDateString()) : null,
                'reference_number' => $isPaid ? ($data['reference_number'] ?? null) : null,
            ]);

            if (! $wasPaid && $isPaid) {
                $obligation = $this->recordAsExpense($user, $obligation);
            }

            $this->logAudit($user, 'update', $obligation, $oldValues, $obligation->fresh()->only(self::AUDITED_FIELDS));

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    public function archive(User $user, TaxObligation $obligation): TaxObligation
    {
        if (! $obligation->is_paid && $obligation->status !== 'Paid') {
            throw ValidationException::withMessages([
                'status' => 'Only paid tax obligations can be archived. In-flight and overdue obligations must remain in the active schedule.',
            ]);
        }

        return DB::transaction(function () use ($user, $obligation) {
            $obligation->update(['deleted_by' => $user->id]);
            $obligation->delete();

            $this->logAudit($user, 'archive', $obligation);

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    public function restore(User $user, int $id): TaxObligation
    {
        return DB::transaction(function () use ($user, $id) {
            // Lookup lives here rather than in the controller: it's the
            // same "find the record this action operates on" work the
            // service already does implicitly for archive() (via route
            // model binding) — restore() just needs onlyTrashed() first
            // since a soft-deleted record won't resolve through normal
            // implicit binding.
            $obligation = TaxObligation::onlyTrashed()->findOrFail($id);

            $obligation->restore();
            $obligation->update(['deleted_by' => null]);

            $this->logAudit($user, 'restore', $obligation);

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense']);
        });
    }

    protected function computeTaxAmount(array $data): float
    {
        $rate = (float) ($data['tax_rate'] ?? 0);
        $taxable = (float) ($data['taxable_amount'] ?? 0);

        return round($taxable * ($rate / 100), 2);
    }

    /**
     * Writes one AuditLog row for a tax obligation event. old/new values
     * are scoped to AUDITED_FIELDS — the obligation's actual financial and
     * status data — rather than the full attribute set, so the diff stored
     * is meaningful instead of noisy with timestamps/foreign keys.
     */
    protected function logAudit(
        User $user,
        string $action,
        TaxObligation $obligation,
        ?array $oldValues = null,
        ?array $newValues = null,
    ): void {
        AuditLog::create([
            'user_id'              => $user->id,
            'module'               => 'Tax Obligations',
            'action'               => $action,
            'record_id'            => $obligation->id,
            'activity_description' => ucfirst($action) . "d {$obligation->tax_type} obligation for {$obligation->tax_period}",
            'old_values'           => $oldValues,
            'new_values'           => $newValues,
            'ip_address'           => request()?->ip(),
            'user_agent'           => request()?->userAgent(),
        ]);
    }

    /**
     * Dedicated method for recording statutory BIR tax payment from a real
     * cash/bank account with required proof of payment.
     *
     * Validates account balance, stores the uploaded proof document, updates
     * status to Paid, and auto-posts the double-entry expense and GL transaction.
     */
    public function recordPayment(User $user, TaxObligation $obligation, array $data, UploadedFile $document): TaxObligation
    {
        if ($obligation->status === 'Paid') {
            throw ValidationException::withMessages([
                'status' => 'This tax obligation has already been recorded as Paid.',
            ]);
        }

        return DB::transaction(function () use ($user, $obligation, $data, $document) {
            /** @var CashAccount $cashAccount */
            $cashAccount = CashAccount::lockForUpdate()->findOrFail($data['cash_account_id']);

            if ((float) $obligation->tax_amount > (float) $cashAccount->current_balance) {
                throw ValidationException::withMessages([
                    'cash_account_id' => sprintf(
                        'Insufficient funds in account "%s" (Available: ₱%s, Tax Due: ₱%s).',
                        $cashAccount->account_name,
                        number_format($cashAccount->current_balance, 2),
                        number_format((float) $obligation->tax_amount, 2)
                    ),
                ]);
            }

            // 1. Attach official payment proof to the tax obligation
            $proofDoc = $this->attachDocument($obligation, $document, $user);

            // 2. Update obligation attributes
            $obligation->update([
                'status'           => 'Paid',
                'payment_date'     => $data['payment_date'],
                'reference_number' => $data['reference_number'],
                'remarks'          => $data['remarks'] ?? $obligation->remarks,
                'cash_account_id'  => $cashAccount->id,
            ]);

            // 3. Post to Expense, deduct from cash account, and post GL journal
            $obligation = $this->recordAsExpense($user, $obligation, $proofDoc);

            // 4. Audit logging
            $this->logAudit($user, 'record_payment', $obligation, null, [
                'amount_paid'     => $obligation->tax_amount,
                'cash_account'    => $cashAccount->account_name,
                'reference'       => $obligation->reference_number,
                'payment_date'    => $obligation->payment_date,
                'document'        => $proofDoc->original_name,
            ]);

            return $obligation->fresh(['createdBy', 'deletedBy', 'expense', 'cashAccount']);
        });
    }

    /**
     * Batch records payment for multiple statutory BIR tax obligations from a single
     * cash/bank account with 1 shared proof of payment (BIR confirmation slip or bank receipt).
     *
     * Validates aggregate account balance upfront, stores the uploaded proof once,
     * updates all obligations to Paid, auto-posts individual expenses/GL entries,
     * and records audit logs.
     */
    public function batchRecordPayment(User $user, array $data, UploadedFile $document): array
    {
        return DB::transaction(function () use ($user, $data, $document) {
            /** @var CashAccount $cashAccount */
            $cashAccount = CashAccount::lockForUpdate()->findOrFail($data['cash_account_id']);

            $obligations = TaxObligation::whereIn('id', $data['tax_ids'])
                ->lockForUpdate()
                ->get();

            if ($obligations->isEmpty()) {
                throw ValidationException::withMessages([
                    'tax_ids' => 'No matching tax obligations were found.',
                ]);
            }

            // Check if any obligation is already Paid
            $alreadyPaid = $obligations->filter(fn ($o) => $o->status === 'Paid');
            if ($alreadyPaid->isNotEmpty()) {
                $labels = $alreadyPaid->map(fn ($o) => "{$o->tax_type} ({$o->tax_period})")->join(', ');
                throw ValidationException::withMessages([
                    'tax_ids' => "The following tax obligation(s) are already marked as Paid: {$labels}.",
                ]);
            }

            // Calculate aggregate tax amount
            $totalTaxAmount = (float) $obligations->sum('tax_amount');

            if ($totalTaxAmount > (float) $cashAccount->current_balance) {
                throw ValidationException::withMessages([
                    'cash_account_id' => sprintf(
                        'Insufficient funds in account "%s" for batch payment (Available: ₱%s, Total Required: ₱%s).',
                        $cashAccount->account_name,
                        number_format($cashAccount->current_balance, 2),
                        number_format($totalTaxAmount, 2)
                    ),
                ]);
            }

            // Store the single proof document in storage
            $timestamp = now()->format('YmdHis');
            $originalName = $document->getClientOriginalName();
            $path = $document->store("tax-obligation-documents/batch/{$timestamp}", 'local');

            $paidObligations = [];

            foreach ($obligations as $obligation) {
                // Attach supporting document record for each obligation
                $proofDoc = SupportingDocument::create([
                    'reference_type' => 'tax_obligation',
                    'reference_id'   => $obligation->id,
                    'file_name'      => basename($path),
                    'original_name'  => $originalName,
                    'storage_path'   => $path,
                    'mime_type'      => $document->getClientMimeType(),
                    'file_size'      => $document->getSize(),
                    'uploaded_by'    => $user->id,
                    'uploaded_at'    => now(),
                ]);

                // Update obligation attributes
                $obligation->update([
                    'status'           => 'Paid',
                    'payment_date'     => $data['payment_date'],
                    'reference_number' => $data['reference_number'],
                    'remarks'          => $data['remarks'] ?? $obligation->remarks,
                    'cash_account_id'  => $cashAccount->id,
                ]);

                // Post to Expense, deduct from cash account, and post GL journal
                $obligation = $this->recordAsExpense($user, $obligation, $proofDoc);

                // Audit logging per obligation
                $this->logAudit($user, 'batch_pay', $obligation, null, [
                    'amount_paid'     => $obligation->tax_amount,
                    'batch_total'     => $totalTaxAmount,
                    'batch_count'     => $obligations->count(),
                    'cash_account'    => $cashAccount->account_name,
                    'reference'       => $obligation->reference_number,
                    'payment_date'    => $obligation->payment_date,
                    'document'        => $originalName,
                ]);

                $paidObligations[] = $obligation->fresh(['createdBy', 'deletedBy', 'expense', 'cashAccount']);
            }

            return [
                'count'        => count($paidObligations),
                'total_amount' => $totalTaxAmount,
                'obligations'  => $paidObligations,
            ];
        });
    }


    /**
     * Creates and approves the corresponding Expense the moment an
     * obligation is marked Paid, so it flows through the exact same
     * budget-deduction + GL-posting path as any other approved expense
     * (see ExpenseService::approve()). This isn't a workflow bypass: the
     * tax was already actually paid to BIR before this obligation is
     * marked Paid in the system, so "approve" here is recording a
     * transaction that's already settled in reality, not skipping review.
     *
     * Idempotent via expense_id — safe to call defensively; will not
     * create a second Expense if one is already linked.
     */
    protected function recordAsExpense(User $user, TaxObligation $obligation, ?SupportingDocument $proofDoc = null): TaxObligation
    {
        if ($obligation->expense_id) {
            return $obligation;
        }

        $budget = Budget::where('budget_code', self::TAX_BUDGET_CODE)->first();
        $category = ExpenseCategory::where('category_code', self::TAX_CATEGORY_CODE)->first();

        if (! $budget || ! $category) {
            throw ValidationException::withMessages([
                'finance' => "Tax obligation expense posting is not configured. Create a Budget with code '" . self::TAX_BUDGET_CODE . "' and an ExpenseCategory with code '" . self::TAX_CATEGORY_CODE . "'.",
            ]);
        }

        $expense = $this->expenseService->create([
            'budget_id'           => $budget->id,
            'expense_category_id' => $category->id,
            'supplier_id'         => null,
            'cash_account_id'     => $obligation->cash_account_id,
            'expense_date'        => $obligation->payment_date,
            'description'         => "{$obligation->tax_type} — {$obligation->tax_period} (BIR payment)",
            'expense_amount'      => $obligation->tax_amount,
            'expense_source'      => $obligation->cashAccount?->account_name ?? 'Statutory Tax Payment',
            'receipt_number'      => $obligation->reference_number,
            'receipt_status'      => Expense::RECEIPT_VERIFIED,
        ], $user);

        // If a payment proof document was uploaded, link it as an expense supporting document
        if ($proofDoc) {
            SupportingDocument::create([
                'reference_type' => 'expense',
                'reference_id'   => $expense->id,
                'file_name'      => $proofDoc->file_name,
                'original_name'  => $proofDoc->original_name,
                'storage_path'   => $proofDoc->storage_path,
                'mime_type'      => $proofDoc->mime_type,
                'file_size'      => $proofDoc->file_size,
                'uploaded_by'    => $user->id,
                'uploaded_at'    => now(),
            ]);
        }

        $expense = $this->expenseService->approve($expense, $user, skipDepartmentCheck: true);

        $obligation->update(['expense_id' => $expense->id]);

        return $obligation;
    }

    /**
     * Attach a supporting document (BIR receipt, official receipt scan,
     * etc.) to a tax obligation, via the same shared supporting_documents
     * table ExpenseService::attachReceipt()/BudgetService's plan upload
     * use (reference_type = 'tax_obligation'). Re-uploading adds a new
     * version rather than replacing the previous one — full history is
     * preserved, same as receipts/plans elsewhere.
     *
     * Deliberately NOT gated on the obligation's Paid/Pending/expense_id
     * state — unlike Budget's plan (required before approval), this is
     * pure documentation with no workflow action depending on it. If tax
     * obligations should require proof before being marked Paid the way
     * Budget requires a plan before approval, that's a separate, larger
     * change to make() in create()/update() — this method alone doesn't
     * enforce it.
     *
     * Storage path: tax-obligation-documents/{obligation_id}/{filename}
     */
    public function attachDocument(TaxObligation $obligation, UploadedFile $file, User $actor): SupportingDocument
    {
        if ($obligation->status === 'Paid') {
            throw ValidationException::withMessages([
                'document' => 'Cannot attach documents to a paid tax obligation.',
            ]);
        }

        $path = $file->store("tax-obligation-documents/{$obligation->id}", 'local');

        $document = SupportingDocument::create([
            'reference_type' => 'tax_obligation',
            'reference_id' => $obligation->id,
            'file_name' => basename($path),
            'original_name' => $file->getClientOriginalName(),
            'storage_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
            'uploaded_by' => $actor->id,
            'uploaded_at' => now(),
        ]);

        $this->logAudit(
            $actor,
            'attach_document',
            $obligation,
            null,
            ['document' => $file->getClientOriginalName()]
        );

        return $document;
    }

    /**
     * Every document ever attached to this obligation, newest first —
     * mirrors ExpenseService::getReceiptHistory() exactly, including the
     * uploaded_by_name/has_file shape the frontend history modal expects.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, SupportingDocument>
     */
    public function getDocumentHistory(TaxObligation $obligation): \Illuminate\Database\Eloquent\Collection
    {
        return SupportingDocument::query()
            ->with('uploader:id,first_name,last_name')
            ->where('reference_type', 'tax_obligation')
            ->where('reference_id', $obligation->id)
            ->orderByDesc('uploaded_at')
            ->orderByDesc('id')
            ->get()
            ->map(function (SupportingDocument $doc) {
                $doc->uploaded_by_name = $doc->uploader
                    ? trim("{$doc->uploader->first_name} {$doc->uploader->last_name}")
                    : null;
                $doc->has_file = (bool) $doc->storage_path;
                return $doc;
            });
    }

    /**
     * Auto-calculate taxable base and estimated tax amount from system transactions
     * (Confirmed Collections, Approved Expenses, Released Disbursements) for a given
     * period (month or quarter) and tax type.
     */
    public function calculateBase(string $taxType, int $year, ?int $month = null, ?int $quarter = null): array
    {
        if ($month) {
            $startDate = Carbon::create($year, $month, 1)->startOfDay();
            $endDate = Carbon::create($year, $month, 1)->endOfMonth()->endOfDay();
            $periodLabel = sprintf('%04d-%02d', $year, $month);
        } elseif ($quarter) {
            $startMonth = ($quarter - 1) * 3 + 1;
            $startDate = Carbon::create($year, $startMonth, 1)->startOfDay();
            $endDate = Carbon::create($year, $startMonth + 2, 1)->endOfMonth()->endOfDay();
            $periodLabel = sprintf('%04d-Q%d', $year, $quarter);
        } else {
            throw ValidationException::withMessages([
                'period' => 'A valid month or quarter is required to calculate tax base.',
            ]);
        }

        // 1. Confirmed collections (Sales / Inflows)
        $collectionsQuery = Collection::where('status', Collection::STATUS_CONFIRMED)
            ->whereBetween('collection_date', [$startDate->toDateString(), $endDate->toDateString()]);
        $grossCollections = (float) $collectionsQuery->sum('amount_received');
        $collectionsCount = (int) $collectionsQuery->count();

        // 2. Approved expenses (Purchases / Outflows)
        $expensesQuery = Expense::where('status', Expense::STATUS_APPROVED)
            ->whereBetween('expense_date', [$startDate->toDateString(), $endDate->toDateString()]);
        $grossExpenses = (float) $expensesQuery->sum('expense_amount');
        $expensesCount = (int) $expensesQuery->count();

        // 3. Released disbursements (Supplier Outflows)
        $disbursementsQuery = Disbursement::whereBetween('payment_date', [$startDate->toDateString(), $endDate->toDateString()]);
        $grossDisbursements = (float) $disbursementsQuery->sum('amount_paid');
        $disbursementsCount = (int) $disbursementsQuery->count();

        $totalOutflows = round($grossExpenses + $grossDisbursements, 2);
        $totalOutflowsCount = $expensesCount + $disbursementsCount;

        // 4. Derive taxable base per statutory tax rules
        switch ($taxType) {
            case 'VAT':
                // Net Taxable Base = Sales minus allowable deductible purchases/expenses
                $suggestedRate = 12.0;
                $taxableAmount = max(0.0, round($grossCollections - $totalOutflows, 2));
                $calculationNotes = sprintf(
                    'Net VAT Base: Confirmed Collections (₱%s across %d records) minus Deductible Expenses & Disbursements (₱%s across %d records). Net Taxable Base = ₱%s.',
                    number_format($grossCollections, 2),
                    $collectionsCount,
                    number_format($totalOutflows, 2),
                    $totalOutflowsCount,
                    number_format($taxableAmount, 2)
                );
                break;

            case 'Withholding Tax':
                // EWT Base = total vendor disbursements & approved expenses in the period
                $suggestedRate = 2.0;
                $taxableAmount = $totalOutflows;
                $calculationNotes = sprintf(
                    'EWT Base: Total Disbursements and Approved Expenses (₱%s across %d records) subject to withholding tax.',
                    number_format($totalOutflows, 2),
                    $totalOutflowsCount
                );
                break;

            case 'Percentage Tax':
                // 3% of Gross Receipts/Sales (Collections)
                $suggestedRate = 3.0;
                $taxableAmount = $grossCollections;
                $calculationNotes = sprintf(
                    'Percentage Tax Base: Total Confirmed Collections / Gross Receipts (₱%s across %d records).',
                    number_format($grossCollections, 2),
                    $collectionsCount
                );
                break;

            case 'Income Tax':
                // Quarterly Corporate Income Tax: 25% of Net Taxable Operating Income
                $suggestedRate = 25.0;
                $taxableAmount = max(0.0, round($grossCollections - $totalOutflows, 2));
                $calculationNotes = sprintf(
                    'Quarterly Net Operating Income: Gross Collections (₱%s across %d records) minus Allowable Expenses & Disbursements (₱%s across %d records). Taxable Net Income = ₱%s.',
                    number_format($grossCollections, 2),
                    $collectionsCount,
                    number_format($totalOutflows, 2),
                    $totalOutflowsCount,
                    number_format($taxableAmount, 2)
                );
                break;

            case 'Local Business Tax':
                $suggestedRate = 2.0;
                $taxableAmount = $grossCollections;
                $calculationNotes = sprintf(
                    'Local Business Tax Base: Total Confirmed Collections / Gross Revenues (₱%s across %d records).',
                    number_format($grossCollections, 2),
                    $collectionsCount
                );
                break;

            case 'Documentary Stamp Tax':
                $suggestedRate = 1.5;
                $taxableAmount = $grossDisbursements;
                $calculationNotes = sprintf(
                    'DST Base: Total Released Disbursements (₱%s across %d records).',
                    number_format($grossDisbursements, 2),
                    $disbursementsCount
                );
                break;

            default:
                $suggestedRate = 12.0;
                $taxableAmount = $grossCollections;
                $calculationNotes = 'Taxable base derived from confirmed collections in the period.';
                break;
        }

        $computedTax = round($taxableAmount * ($suggestedRate / 100), 2);

        return [
            'tax_type'                 => $taxType,
            'tax_period'               => $periodLabel,
            'date_range'               => [
                'start_date' => $startDate->toDateString(),
                'end_date'   => $endDate->toDateString(),
            ],
            'suggested_taxable_amount' => $taxableAmount,
            'suggested_tax_rate'       => $suggestedRate,
            'estimated_tax_amount'     => $computedTax,
            'breakdown'                => [
                'gross_collections'        => $grossCollections,
                'collections_count'        => $collectionsCount,
                'gross_expenses'           => $grossExpenses,
                'expenses_count'           => $expensesCount,
                'gross_disbursements'      => $grossDisbursements,
                'disbursements_count'      => $disbursementsCount,
                'total_deductible_outflow' => $totalOutflows,
                'outflows_count'           => $totalOutflowsCount,
                'net_operating_base'       => round($grossCollections - $totalOutflows, 2),
                'notes'                    => $calculationNotes,
            ],
        ];
    }

    /**
     * Auto-generate periodic statutory tax filing schedules based on Philippine BIR regulations.
     *
     * Creates scheduled tax obligations for the selected fiscal year / quarter
     * based on Philippine BIR statutory deadlines. Idempotent: skips periods
     * that already exist. Optionally calculates taxable amounts for past/current
     * periods from system transactions.
     */
    public function generateSchedule(User $user, array $data): array
    {
        $year = (int) $data['year'];
        $scope = $data['period_scope']; // 'full_year', 'q1', 'q2', 'q3', 'q4'
        $selectedTaxTypes = $data['tax_types'];
        $autoCalc = (bool) ($data['auto_calculate_past'] ?? false);

        // Define monthly and quarterly scopes
        $months = match ($scope) {
            'q1'        => [1, 2, 3],
            'q2'        => [4, 5, 6],
            'q3'        => [7, 8, 9],
            'q4'        => [10, 11, 12],
            default     => range(1, 12),
        };

        $quarters = match ($scope) {
            'q1'        => [1],
            'q2'        => [2],
            'q3'        => [3],
            'q4'        => [4],
            default     => [1, 2, 3, 4],
        };

        $taxConfigs = [
            'VAT' => [
                'type'        => 'month',
                'rate'        => 12.0,
                'compute_due' => function (int $y, int $m) {
                    $ny = $y; $nm = $m + 1;
                    if ($nm > 12) { $nm = 1; $ny += 1; }
                    return sprintf('%04d-%02d-20', $ny, $nm);
                },
            ],
            'Withholding Tax' => [
                'type'        => 'month',
                'rate'        => 2.0,
                'compute_due' => function (int $y, int $m) {
                    $ny = $y; $nm = $m + 1;
                    if ($nm > 12) { $nm = 1; $ny += 1; }
                    return sprintf('%04d-%02d-10', $ny, $nm);
                },
            ],
            'Percentage Tax' => [
                'type'        => 'month',
                'rate'        => 3.0,
                'compute_due' => function (int $y, int $m) {
                    $ny = $y; $nm = $m + 1;
                    if ($nm > 12) { $nm = 1; $ny += 1; }
                    return sprintf('%04d-%02d-20', $ny, $nm);
                },
            ],
            'Documentary Stamp Tax' => [
                'type'        => 'month',
                'rate'        => 1.5,
                'compute_due' => function (int $y, int $m) {
                    $ny = $y; $nm = $m + 1;
                    if ($nm > 12) { $nm = 1; $ny += 1; }
                    return sprintf('%04d-%02d-05', $ny, $nm);
                },
            ],
            'Income Tax' => [
                'type'        => 'quarter',
                'rate'        => 25.0,
                'compute_due' => function (int $y, int $q) {
                    return match ($q) {
                        1 => sprintf('%04d-05-15', $y),
                        2 => sprintf('%04d-08-15', $y),
                        3 => sprintf('%04d-11-15', $y),
                        4 => sprintf('%04d-04-15', $y + 1),
                        default => sprintf('%04d-05-15', $y),
                    };
                },
            ],
            'Local Business Tax' => [
                'type'        => 'quarter',
                'rate'        => 2.0,
                'compute_due' => function (int $y, int $q) {
                    return match ($q) {
                        1 => sprintf('%04d-01-20', $y),
                        2 => sprintf('%04d-04-20', $y),
                        3 => sprintf('%04d-07-20', $y),
                        4 => sprintf('%04d-10-20', $y),
                        default => sprintf('%04d-01-20', $y),
                    };
                },
            ],
        ];

        return DB::transaction(function () use ($user, $year, $scope, $months, $quarters, $selectedTaxTypes, $autoCalc, $taxConfigs) {
            $created = [];
            $skipped = 0;

            foreach ($selectedTaxTypes as $taxType) {
                if (! isset($taxConfigs[$taxType])) {
                    continue;
                }

                $cfg = $taxConfigs[$taxType];

                if ($cfg['type'] === 'month') {
                    foreach ($months as $m) {
                        $period = sprintf('%04d-%02d', $year, $m);

                        $exists = TaxObligation::withTrashed()
                            ->where('tax_type', $taxType)
                            ->where('tax_period', $period)
                            ->exists();

                        if ($exists) {
                            $skipped++;
                            continue;
                        }

                        $dueDate = ($cfg['compute_due'])($year, $m);
                        $rate = (float) $cfg['rate'];
                        $taxableAmount = 0.0;
                        $taxAmount = 0.0;

                        // Check if period is past or current
                        $periodStart = Carbon::create($year, $m, 1)->startOfDay();
                        if ($autoCalc && $periodStart->lte(now())) {
                            try {
                                $calc = $this->calculateBase($taxType, $year, month: $m);
                                $taxableAmount = (float) ($calc['suggested_taxable_amount'] ?? 0.0);
                                $rate = (float) ($calc['suggested_tax_rate'] ?? $rate);
                                $taxAmount = (float) ($calc['estimated_tax_amount'] ?? 0.0);
                            } catch (\Throwable) {
                                // Fallback to 0 if calculation errors
                            }
                        }

                        $obligation = TaxObligation::create([
                            'tax_type'       => $taxType,
                            'tax_period'     => $period,
                            'due_date'       => $dueDate,
                            'tax_rate'       => $rate,
                            'taxable_amount' => $taxableAmount,
                            'tax_amount'     => $taxAmount,
                            'status'         => 'Pending',
                            'created_by'     => $user->id,
                        ]);

                        $created[] = $obligation;
                    }
                } else {
                    // Quarterly tax
                    foreach ($quarters as $q) {
                        $period = sprintf('%04d-Q%d', $year, $q);

                        $exists = TaxObligation::withTrashed()
                            ->where('tax_type', $taxType)
                            ->where('tax_period', $period)
                            ->exists();

                        if ($exists) {
                            $skipped++;
                            continue;
                        }

                        $dueDate = ($cfg['compute_due'])($year, $q);
                        $rate = (float) $cfg['rate'];
                        $taxableAmount = 0.0;
                        $taxAmount = 0.0;

                        $startMonth = ($q - 1) * 3 + 1;
                        $periodStart = Carbon::create($year, $startMonth, 1)->startOfDay();
                        if ($autoCalc && $periodStart->lte(now())) {
                            try {
                                $calc = $this->calculateBase($taxType, $year, quarter: $q);
                                $taxableAmount = (float) ($calc['suggested_taxable_amount'] ?? 0.0);
                                $rate = (float) ($calc['suggested_tax_rate'] ?? $rate);
                                $taxAmount = (float) ($calc['estimated_tax_amount'] ?? 0.0);
                            } catch (\Throwable) {
                                // Fallback to 0
                            }
                        }

                        $obligation = TaxObligation::create([
                            'tax_type'       => $taxType,
                            'tax_period'     => $period,
                            'due_date'       => $dueDate,
                            'tax_rate'       => $rate,
                            'taxable_amount' => $taxableAmount,
                            'tax_amount'     => $taxAmount,
                            'status'         => 'Pending',
                            'created_by'     => $user->id,
                        ]);

                        $created[] = $obligation;
                    }
                }
            }

            if (count($created) > 0) {
                AuditLog::create([
                    'user_id'              => $user->id,
                    'module'               => 'Tax Obligations',
                    'action'               => 'generate_schedule',
                    'record_id'            => $created[0]->id,
                    'activity_description' => sprintf(
                        'Generated %d statutory tax filing schedules for FY %d (%d already existed and were skipped).',
                        count($created),
                        $year,
                        $skipped
                    ),
                    'old_values'           => null,
                    'new_values'           => [
                        'year'          => $year,
                        'scope'         => $scope,
                        'created_count' => count($created),
                        'skipped_count' => $skipped,
                    ],
                    'ip_address'           => request()?->ip(),
                    'user_agent'           => request()?->userAgent(),
                ]);
            }

            return [
                'year'          => $year,
                'scope'         => $scope,
                'created_count' => count($created),
                'skipped_count' => $skipped,
                'total_records' => count($created) + $skipped,
            ];
        });
    }
}