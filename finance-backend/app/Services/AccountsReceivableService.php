<?php

namespace App\Services;

use App\Models\AccountsReceivable;
use App\Models\AuditLog;
use App\Models\ChartOfAccount;
use App\Models\Customer;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\Setting;
use App\Models\SupportingDocument;
use App\Models\User;
use App\Support\FileStorage;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AccountsReceivableService
{
    /**
     * $filters: ['status' => ?string, 'archived' => bool, 'search' => ?string, 'collector_id' => ?int]
     * Matches the filter behavior already implemented client-side in
     * AccountsReceivable.jsx's `filtered` useMemo, moved server-side.
     *
     * collector_id is the enforcement point for Collector-role scoping —
     * see AccountsReceivableController::index(), which forces this value
     * to the caller's own collector id rather than trusting the client.
     */
    public function list(array $filters = []): Collection
    {
        $query = AccountsReceivable::query()->with(['customer', 'collector']);

        // Soft-deleted rows are excluded by default via SoftDeletes' global
        // scope. is_archived is a separate flag — only filter on it when the
        // caller explicitly asks for a subset, so a plain list() call can
        // return everything (active + archived) in one request.
        if (array_key_exists('archived', $filters)) {
            $query->where('is_archived', $filters['archived']);
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $query->where('status', $filters['status']);
        }

        if (array_key_exists('collector_id', $filters) && $filters['collector_id'] !== null) {
            $query->where('collector_id', $filters['collector_id']);
        }

        if (! empty($filters['search'])) {
            $term = '%' . $filters['search'] . '%';
            $query->where(function ($q) use ($term) {
                $q->where('invoice_number', 'ilike', $term)
                    ->orWhere('reference_no', 'ilike', $term)
                    ->orWhereHas('customer', function ($cq) use ($term) {
                        $cq->where('customer_name', 'ilike', $term);
                    });
            });
        }

        return $query->orderByDesc('created_at')->get();
    }

    public function create(User $actor, array $data): AccountsReceivable
    {
        return DB::transaction(function () use ($actor, $data) {
            $balance = $data['balance'] ?? $data['original_amount'];
            // Fall back to the company-wide default from Settings when the
            // invoice doesn't carry its own penalty rate.
            $penaltyRate = $data['penalty_rate'] ?? Setting::current()->default_penalty_rate;
            $penaltyAmount = $penaltyRate > 0
                ? round(($data['original_amount'] * $penaltyRate) / 100, 2)
                : 0;

            $referenceNo = !empty($data['reference_no'])
                ? $data['reference_no']
                : self::generateReferenceNo();

            $ar = AccountsReceivable::create([
                'customer_id' => $data['customer_id'],
                'collector_id' => $data['collector_id'] ?? null,
                'invoice_number' => $data['invoice_number'],
                'invoice_date' => $data['invoice_date'],
                'due_date' => $data['due_date'],
                'original_amount' => $data['original_amount'],
                'paid_amount' => max(0, $data['original_amount'] - $balance),
                'remaining_balance' => $balance,
                'payment_method' => $data['payment_method'] ?? null,
                'payment_terms' => $data['payment_terms'] ?? null,
                'purchase_order_no' => $data['purchase_order_no'] ?? null,
                'reference_no' => $referenceNo,
                'penalty_rate' => $penaltyRate,
                'penalty_amount' => $penaltyAmount,
                'remarks' => $data['remarks'] ?? null,
                'status' => $data['status'],
                'created_by' => $actor->id,
                'is_archived' => false,
            ]);

            // Accrual revenue recognition: Dr Accounts Receivable / Cr Revenue
            // on the invoice date. Idempotent — safe for invoices created
            // directly in a paid/prepaid state (collections close out the AR).
            $ar->loadMissing('customer:id,customer_name');
            $this->reconcileJournals($ar, $actor);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'AccountsReceivable',
                'action' => 'create',
                'record_id' => $ar->id,
                'activity_description' => "Created invoice {$ar->invoice_number}.",
                'new_values' => $ar->only(array_keys($data)),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $ar->load(['customer', 'collector']);
        });
    }

    public function update(User $actor, AccountsReceivable $ar, array $data): AccountsReceivable
    {
        return DB::transaction(function () use ($actor, $ar, $data) {
            $original = $ar->only(array_keys($data) + ['id']);

            $balance = $data['balance'] ?? $data['original_amount'];
            // Same Settings fallback as create(): an update that omits the
            // penalty rate adopts the company default rather than silently 0.
            $penaltyRate = $data['penalty_rate'] ?? Setting::current()->default_penalty_rate;
            $penaltyAmount = $penaltyRate > 0
                ? round(($data['original_amount'] * $penaltyRate) / 100, 2)
                : 0;

            $ar->update([
                'customer_id' => $data['customer_id'],
                'collector_id' => array_key_exists('collector_id', $data) ? $data['collector_id'] : $ar->collector_id,
                'invoice_number' => $data['invoice_number'],
                'invoice_date' => $data['invoice_date'],
                'due_date' => $data['due_date'],
                'original_amount' => $data['original_amount'],
                'paid_amount' => max(0, $data['original_amount'] - $balance),
                'remaining_balance' => $balance,
                'payment_method' => $data['payment_method'] ?? null,
                'payment_terms' => $data['payment_terms'] ?? null,
                'purchase_order_no' => $data['purchase_order_no'] ?? null,
                'reference_no' => $data['reference_no'] ?? null,
                'penalty_rate' => $penaltyRate,
                'penalty_amount' => $penaltyAmount,
                'remarks' => $data['remarks'] ?? null,
                'status' => $data['status'],
            ]);

            // Reconcile the posted AR/revenue journal to the new invoice amount
            // (posts a delta adjustment, or a full reversal if cancelled).
            $ar->loadMissing('customer:id,customer_name');
            $this->reconcileJournals($ar, $actor);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'AccountsReceivable',
                'action' => 'update',
                'record_id' => $ar->id,
                'activity_description' => "Updated invoice {$ar->invoice_number}.",
                'old_values' => $original,
                'new_values' => $ar->only(array_keys($data) + ['id']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $ar->load(['customer', 'collector']);
        });
    }

    /* ---------------------------------------------------------------------- */
    /* Accrual revenue recognition                                             */
    /* ---------------------------------------------------------------------- */

    /**
     * Keeps the posted AR ↔ Revenue journal in sync with the invoice.
     *
     * Target net (Dr AR − Cr Revenue, restricted to lines with
     * reference_type 'Accounts Receivable') is original_amount for every
     * non-cancelled invoice and 0 for a cancelled one. The difference is
     * posted as a single delta entry, so calling this is fully idempotent:
     *
     *  - create()  → posts the full Dr AR / Cr Revenue entry (accrual on the
     *                invoice date; collections later close the receivable).
     *  - update()  → posts a delta adjustment when original_amount changes,
     *                or a full reversal when the invoice is cancelled.
     *  - backfill  → existing invoices can be brought onto the books by
     *                calling this once per invoice (see notes in summary).
     *
     * Revenue is recognized on issue (accrual basis), so the GL and the
     * income statement carry the full fiscal-year revenue even before cash
     * is collected.
     */
    public function reconcileJournals(AccountsReceivable $ar, User $actor): void
    {
        if (! $ar->exists) {
            return;
        }

        $amount = (float) ($ar->original_amount ?? 0);
        $target = $ar->status === 'Cancelled' ? 0.00 : round($amount, 2);
        $current = $this->arJournalNet($ar->id);
        $delta = round($target - $current, 2);

        if (abs($delta) < 0.005) {
            return;
        }

        $this->postArJournal($ar, $actor, $delta);
    }

    /** Net balance on the AR control account for this invoice. */
    private function arJournalNet(int $arId): float
    {
        $arControl = $this->resolveArControlAccount();

        if (! $arControl) {
            return 0.0;
        }

        return (float) JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.status', 'Posted')
            ->where('journal_entry_lines.reference_type', 'Accounts Receivable')
            ->where('journal_entry_lines.reference_id', $arId)
            ->where('journal_entry_lines.account_id', $arControl->id)
            ->selectRaw('COALESCE(SUM(journal_entry_lines.debit - journal_entry_lines.credit), 0) as n')
            ->value('n');
    }

    /**
     * The single Accounts Receivable control account, resolved from the
     * pinned ChartOfAccount::arControlId() setting (falling back to the
     * legacy name lookup) so it stays stable even if the account is renamed.
     */
    private function resolveArControlAccount(): ?ChartOfAccount
    {
        return ChartOfAccount::arControlAccount();
    }

    /**
     * Posts one balanced pair for this invoice. $delta > 0 recognizes
     * revenue (Dr AR / Cr Revenue); $delta < 0 reverses it (Dr Revenue /
     * Cr AR), which is what an adjustment or cancellation looks like.
     */
    private function postArJournal(AccountsReceivable $ar, User $actor, float $delta): void
    {
        $amount = abs($delta);
        $arControl = $this->resolveArControlAccount();
        $revenue = $this->resolveRevenueAccount();

        if (! $arControl || ! $revenue) {
            throw ValidationException::withMessages([
                'finance' => 'Cannot post invoice journal — chart of accounts is missing the '
                    . '"Accounts Receivable" control account or an active Revenue account.',
            ]);
        }

        $customerName = $ar->customer->customer_name ?? "Customer #{$ar->customer_id}";
        $isReversal = $delta < 0;

        $entry = JournalEntry::create([
            'transaction_no'   => 'JE-AR-' . $ar->id . '-' . now()->format('YmdHis') . Str::upper(Str::random(2)),
            'transaction_date' => $ar->invoice_date ?? now(),
            'description'      => $isReversal
                ? sprintf('Reversal — invoice %s (%s)', $ar->invoice_number, $customerName)
                : sprintf('Invoice %s recorded — %s', $ar->invoice_number, $customerName),
            'status'     => 'Posted',
            'posted_by'  => $actor->id,
            'posted_at'  => now(),
            'created_by' => $actor->id,
        ]);

        $entry->lines()->createMany([
            [
                // AR control increases on recognition, decreases on reversal
                'account_id'     => $arControl->id,
                'debit'          => $isReversal ? '0.00' : sprintf('%.2f', $amount),
                'credit'         => $isReversal ? sprintf('%.2f', $amount) : '0.00',
                'reference_type' => 'Accounts Receivable',
                'reference_id'   => $ar->id,
                'remarks'        => $customerName,
            ],
            [
                // Inverted on the revenue side
                'account_id'     => $revenue->id,
                'debit'          => $isReversal ? sprintf('%.2f', $amount) : '0.00',
                'credit'         => $isReversal ? '0.00' : sprintf('%.2f', $amount),
                'reference_type' => 'Accounts Receivable',
                'reference_id'   => $ar->id,
                'remarks'        => "Invoice {$ar->invoice_number}",
            ],
        ]);
    }

    /**
     * Picks the revenue account the company books service income to.
     * Defaults to Service Revenue, falls back to Sales Revenue, then to any
     * active Revenue account. Swap the priority list to change the default
     * posting account for invoices.
     *
     * @return \App\Models\ChartOfAccount|null
     */
    private function resolveRevenueAccount(): ?ChartOfAccount
    {
        $priority = ['Service Revenue', 'Sales Revenue'];

        foreach ($priority as $name) {
            $account = ChartOfAccount::where('account_name', $name)
                ->where('account_type', 'Revenue')
                ->where('is_active', true)
                ->first();
            if ($account) {
                return $account;
            }
        }

        return ChartOfAccount::where('account_type', 'Revenue')
            ->where('is_active', true)
            ->first();
    }

    /**
     * Flips is_archived, matching the single toggle button in the frontend
     * (Archive / RotateCcw icon on the same action).
     */
    public function toggleArchive(User $actor, AccountsReceivable $ar): AccountsReceivable
    {
        $nextArchived = ! $ar->is_archived;

        // When archiving, only completed/settled invoices (Paid or Cancelled) can be archived.
        // In-flight or overdue invoices must remain in the active collections queue.
        if ($nextArchived && ! in_array($ar->status, ['Paid', 'Cancelled'], true)) {
            throw ValidationException::withMessages([
                'status' => 'Only completed or settled invoices (Paid or Cancelled) can be archived. In-flight and overdue invoices must remain in the active collections queue.',
            ]);
        }

        return DB::transaction(function () use ($actor, $ar, $nextArchived) {
            $ar->update([
                'is_archived' => $nextArchived,
                'archived_at' => $nextArchived ? now() : null,
                'archived_by' => $nextArchived ? $actor->id : null,
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'AccountsReceivable',
                'action' => $nextArchived ? 'archive' : 'restore',
                'record_id' => $ar->id,
                'activity_description' => ($nextArchived ? 'Archived' : 'Restored') . " invoice {$ar->invoice_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $ar->load(['customer', 'collector']);
        });
    }

    public static function generateReferenceNo(): string
    {
        $last = AccountsReceivable::withTrashed()
            ->where('reference_no', 'like', 'REF-AR-%')
            ->orderByDesc('id')
            ->value('reference_no');

        $nextNum = 1;
        if ($last && preg_match('/REF-AR-(\d+)/i', $last, $matches)) {
            $nextNum = (int) $matches[1] + 1;
        } else {
            $count = AccountsReceivable::withTrashed()->count();
            $nextNum = $count + 1;
        }

        while (AccountsReceivable::withTrashed()->where('reference_no', sprintf('REF-AR-%03d', $nextNum))->exists()) {
            $nextNum++;
        }

        return sprintf('REF-AR-%03d', $nextNum);
    }

    public function attachDocument(AccountsReceivable $ar, UploadedFile $file, User $actor): SupportingDocument
    {
        $path = $file->store("accounts-receivable-documents/{$ar->id}", FileStorage::DISK);

        $document = SupportingDocument::create([
            'reference_type' => 'accounts_receivable',
            'reference_id' => $ar->id,
            'file_name' => basename($path),
            'original_name' => $file->getClientOriginalName(),
            'storage_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
            'uploaded_by' => $actor->id,
            'uploaded_at' => now(),
        ]);

        AuditLog::create([
            'user_id' => $actor->id,
            'module' => 'AccountsReceivable',
            'action' => 'attach_document',
            'record_id' => $ar->id,
            'activity_description' => "Attached document \"{$file->getClientOriginalName()}\" to invoice {$ar->invoice_number}.",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $document;
    }

    public function getDocumentHistory(AccountsReceivable $ar): Collection
    {
        return SupportingDocument::query()
            ->with('uploader:id,first_name,last_name')
            ->where('reference_type', 'accounts_receivable')
            ->where('reference_id', $ar->id)
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

    /* ---------------------------------------------------------------------- */
    /* Aging & Statement of Account                                            */
    /* ---------------------------------------------------------------------- */

    /**
     * Returns an aging summary matrix: one row per customer with subtotals
     * for each aging bucket (Current, 1-30, 31-60, 61-90, 90+ days overdue).
     * Only non-archived, non-paid, non-cancelled active invoices are counted.
     *
     * $collectorId narrows the summary to a single collector's assigned
     * invoices (Collector-role callers must never see other collectors'
     * customers' aging).
     */
    public function getAgingSummary(?int $collectorId = null): array
    {
        $today = Carbon::today();

        $invoices = AccountsReceivable::query()
            ->with('customer:id,customer_name,customer_code,email,contact_person,contact_number,address')
            ->where('is_archived', false)
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->when($collectorId, fn ($q) => $q->where('collector_id', $collectorId))
            ->whereNull('deleted_at')
            ->get();

        // Group by customer and bucket each invoice
        $byCustomer = [];
        foreach ($invoices as $inv) {
            $custId   = $inv->customer_id;
            $custName = $inv->customer->customer_name ?? "Customer #{$custId}";

            if (!isset($byCustomer[$custId])) {
                $byCustomer[$custId] = [
                    'customer_id'      => $custId,
                    'customer_name'    => $custName,
                    'customer_code'    => $inv->customer->customer_code ?? null,
                    'email'            => $inv->customer->email ?? null,
                    'contact_person'   => $inv->customer->contact_person ?? null,
                    'contact_number'   => $inv->customer->contact_number ?? null,
                    'address'          => $inv->customer->address ?? null,
                    'current'          => 0.0,
                    'd1_30'            => 0.0,
                    'd31_60'           => 0.0,
                    'd61_90'           => 0.0,
                    'over90'           => 0.0,
                    'total_outstanding' => 0.0,
                    'invoice_count'    => 0,
                ];
            }

            $balance   = (float) $inv->remaining_balance;
            $dueDate   = Carbon::parse($inv->due_date);
            $daysOverdue = $today->diffInDays($dueDate, false); // negative = overdue

            if ($daysOverdue >= 0) {
                $byCustomer[$custId]['current'] += $balance;
            } elseif ($daysOverdue >= -30) {
                $byCustomer[$custId]['d1_30'] += $balance;
            } elseif ($daysOverdue >= -60) {
                $byCustomer[$custId]['d31_60'] += $balance;
            } elseif ($daysOverdue >= -90) {
                $byCustomer[$custId]['d61_90'] += $balance;
            } else {
                $byCustomer[$custId]['over90'] += $balance;
            }

            $byCustomer[$custId]['total_outstanding'] += $balance;
            $byCustomer[$custId]['invoice_count']++;
        }

        // Sort by total outstanding descending
        usort($byCustomer, fn ($a, $b) => $b['total_outstanding'] <=> $a['total_outstanding']);

        return array_values($byCustomer);
    }

    /**
     * Returns a full Statement of Account for a single customer:
     * customer header, aging buckets, and a line-by-line invoice list.
     *
     * $collectorId limits which invoices go on the statement (Collector-role
     * callers only ever see their own assigned invoices).
     */
    public function getStatementOfAccount(int $customerId, ?int $collectorId = null): array
    {
        $today    = Carbon::today();
        $customer = Customer::findOrFail($customerId);

        $invoices = AccountsReceivable::query()
            ->where('customer_id', $customerId)
            ->where('is_archived', false)
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->when($collectorId, fn ($q) => $q->where('collector_id', $collectorId))
            ->whereNull('deleted_at')
            ->orderBy('due_date')
            ->get();

        $aging = ['current' => 0.0, 'd1_30' => 0.0, 'd31_60' => 0.0, 'd61_90' => 0.0, 'over90' => 0.0];
        $lines = [];

        foreach ($invoices as $inv) {
            $balance     = (float) $inv->remaining_balance;
            $dueDate     = Carbon::parse($inv->due_date);
            $daysOverdue = $today->diffInDays($dueDate, false);

            if ($daysOverdue >= 0) {
                $bucket = 'current';
                $aging['current'] += $balance;
            } elseif ($daysOverdue >= -30) {
                $bucket = 'd1_30';
                $aging['d1_30'] += $balance;
            } elseif ($daysOverdue >= -60) {
                $bucket = 'd31_60';
                $aging['d31_60'] += $balance;
            } elseif ($daysOverdue >= -90) {
                $bucket = 'd61_90';
                $aging['d61_90'] += $balance;
            } else {
                $bucket = 'over90';
                $aging['over90'] += $balance;
            }

            $lines[] = [
                'ar_id'            => $inv->id,
                'invoice_number'   => $inv->invoice_number,
                'reference_no'     => $inv->reference_no,
                'invoice_date'     => $inv->invoice_date,
                'due_date'         => $inv->due_date,
                'original_amount'  => (float) $inv->original_amount,
                'paid_amount'      => (float) $inv->paid_amount,
                'remaining_balance'=> $balance,
                'penalty_rate'     => (float) $inv->penalty_rate,
                'penalty_amount'   => (float) $inv->penalty_amount,
                'status'           => $inv->status,
                'days_overdue'     => $daysOverdue >= 0 ? 0 : abs((int) $daysOverdue),
                'aging_bucket'     => $bucket,
            ];
        }

        return [
            'customer' => [
                'id'             => $customer->id,
                'customer_code'  => $customer->customer_code,
                'customer_name'  => $customer->customer_name,
                'contact_person' => $customer->contact_person,
                'contact_number' => $customer->contact_number,
                'email'          => $customer->email,
                'address'        => $customer->address,
                'credit_limit'   => (float) $customer->credit_limit,
            ],
            'aging'            => $aging,
            'total_outstanding' => array_sum($aging),
            'invoices'         => $lines,
            'as_of_date'       => $today->toDateString(),
        ];
    }

    /**
     * Returns SOA data for all customers that have at least one active
     * outstanding invoice — used for the batch-print feature.
     */
    public function getBatchStatementOfAccounts(): array
    {
        $today = Carbon::today();

        // Get distinct customer IDs that have outstanding invoices
        $customerIds = AccountsReceivable::query()
            ->where('is_archived', false)
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->whereNull('deleted_at')
            ->distinct()
            ->pluck('customer_id');

        $result = [];
        foreach ($customerIds as $customerId) {
            $result[] = $this->getStatementOfAccount($customerId);
        }

        // Sort by total outstanding descending
        usort($result, fn ($a, $b) => $b['total_outstanding'] <=> $a['total_outstanding']);

        return $result;
    }

    /**
     * Re-apply the company-wide default penalty rate to every unpaid
     * (non-Paid, non-Cancelled, non-archived) invoice. Called by
     * SettingsService when the default changes.
     *
     * Deliberately a bulk query-builder update: it skips Eloquent model
     * events, which is what we want here — remaining_balance is untouched,
     * so recalculating every customer's balance row-by-row would be pure
     * overhead. Returns the number of invoices updated.
     */
    public function applyDefaultPenaltyRate(float $rate): int
    {
        return AccountsReceivable::query()
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->where('is_archived', false)
            ->update([
                'penalty_rate' => $rate,
                'penalty_amount' => DB::raw('ROUND(original_amount * ' . $rate . ' / 100, 2)'),
            ]);
    }
}