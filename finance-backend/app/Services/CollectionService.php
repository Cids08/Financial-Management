<?php

namespace App\Services;

use App\Events\CollectionStatusChanged;
use App\Models\AccountsReceivable;
use App\Models\AuditLog;
use App\Models\CashAccount;
use App\Models\ChartOfAccount;
use App\Models\Collection;
use App\Models\Collector;
use App\Models\JournalEntry;
use App\Models\Notification;
use App\Models\SupportingDocument;
use App\Models\User;
use App\Support\FileStorage;
use App\Support\Money;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CollectionService
{
    use \App\Concerns\LocksReferencePrefix;
    /**
     * @param array{search?:string,collector_id?:int,status?:string,trashed?:bool,per_page?:int} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = Collection::query()
            ->with([
                'accountsReceivable:id,invoice_number',
                'collector:id,first_name,last_name',
                'cashAccount:id,account_name',
                // deleter is included so CollectionResource can populate
                // deleted_by_name for the frontend's "Archived by" row.
                'deleter:id,first_name,last_name',
            ]);

        $query->withExists(['supportingDocuments as has_supporting_proof' => fn ($q) => $q->whereNotNull('storage_path')]);
        if (\Illuminate\Support\Facades\Schema::hasTable('deposit_batch_items')) $query->with('depositBatches:id');

        if (! empty($filters['trashed'])) {
            $query->onlyTrashed();
        }

        $query
            ->search($filters['search'] ?? null)
            ->forCollector($filters['collector_id'] ?? null)
            ->status($filters['status'] ?? null);

        if (! empty($filters['ar_id'])) {
            $query->where('ar_id', $filters['ar_id']);
        }

        return $query
            ->orderByDesc('collection_date')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 15);
    }

    /**
     * Feature 1: a collector may only record a collection against an
     * AR/invoice that is actually assigned to them
     * (accounts_receivable.collector_id). This is the enforcement
     * point — locked so two concurrent requests can't both pass the
     * check against a since-reassigned invoice.
     */
    public function create(array $data, User $creator): Collection
    {
        return DB::transaction(function () use ($data, $creator) {
            /** @var AccountsReceivable $ar */
            $ar = AccountsReceivable::query()->lockForUpdate()->findOrFail($data['ar_id']);

            // If the user creating the collection is a collector, bind to their own collector profile
            if ($creator->role?->name === 'collector') {
                $userCollectorId = $creator->collector?->id;
                if (! $userCollectorId) {
                    throw ValidationException::withMessages([
                        'collector_id' => 'Your user account is not linked to an active collector profile.',
                    ]);
                }
                $data['collector_id'] = $userCollectorId;
            }

            if ((int) $ar->collector_id !== (int) $data['collector_id']) {
                throw ValidationException::withMessages([
                    'collector_id' => $ar->collector_id
                        ? "Invoice {$ar->invoice_number} is assigned to a different collector."
                        : "Invoice {$ar->invoice_number} has no collector assigned yet — assign it before recording a collection.",
                ]);
            }

            if (Money::comp((string) $data['amount_received'], (string) $ar->remaining_balance, 2) > 0) {
                throw ValidationException::withMessages([
                    'amount_received' => sprintf(
                        'Amount received (%.2f) exceeds the invoice\'s remaining balance (%.2f).',
                        $data['amount_received'],
                        $ar->remaining_balance
                    ),
                ]);
            }

            $referenceNumber = !empty($data['reference_number'])
                ? $data['reference_number']
                : self::generateReferenceNumber();

            $collection = Collection::create([
                ...$data,
                'reference_number' => $referenceNumber,
                'status'     => Collection::STATUS_PENDING,
                'created_by' => $creator->id,
            ]);

            AuditLog::create([
                'user_id'              => $creator->id,
                'module'               => 'Collections',
                'action'               => 'create',
                'record_id'            => $collection->id,
                'activity_description' => "Recorded collection #{$collection->id} against invoice {$ar->invoice_number}.",
                'new_values'           => $collection->only(['ar_id', 'collector_id', 'amount_received', 'status']),
                'ip_address'           => request()->ip(),
                'user_agent'           => request()->userAgent(),
            ]);

            $collection->loadMissing(['collector', 'creator']);
            $collectorName = $collection->collector
                ? trim("{$collection->collector->first_name} {$collection->collector->last_name}")
                : trim("{$creator->first_name} {$creator->last_name}");
            if (empty($collectorName)) {
                $collectorName = 'Collector';
            }
            $formattedAmount = number_format((float) $collection->amount_received, 2);
            $receiptNo = $collection->receipt_number ?? $collection->reference_number ?? (string) $collection->id;

            $this->notifyStakeholders(
                $collection,
                'New Collection Recorded',
                sprintf(
                    '%s recorded a collection of ₱%s for invoice %s (Receipt #%s). Pending confirmation.',
                    $collectorName,
                    $formattedAmount,
                    $ar->invoice_number,
                    $receiptNo
                ),
                'Info',
                false
            );

            return $collection;
        });
    }

    public function update(Collection $collection, array $data, User $actor): Collection
    {
        if ($collection->status === Collection::STATUS_CONFIRMED) {
            throw ValidationException::withMessages([
                'status' => 'Confirmed collections cannot be edited directly.',
            ]);
        }

        // Status has dedicated endpoints (confirm() / cancel()) that apply
        // the financial side effects — AR remaining-balance reduction, cash
        // credit, double-entry journal entry, notifications. Writing the
        // status field through the EDIT endpoint would let a collections.
        // manage holder (collector/staff) "confirm" a collection without
        // ANY of that happening. Reject any transition here; a status value
        // equal to the current one is a no-op and dropped.
        if (array_key_exists('status', $data)) {
            if ($data['status'] !== $collection->status) {
                throw ValidationException::withMessages([
                    'status' => 'Change the collection status via the confirm/cancel actions, not the edit form.',
                ]);
            }
            unset($data['status']);
        }

        // Same over-collection guard as create(). Editing a pending
        // collection's amount past the AR's remaining balance used to pass
        // here and then get silently floored at confirm() — while the cash
        // account and journal entry still carried the inflated figure.
        if (array_key_exists('amount_received', $data)) {
            $ar = AccountsReceivable::query()->find($collection->ar_id);
            if ($ar && Money::comp((string) $data['amount_received'], (string) $ar->remaining_balance, 2) > 0) {
                throw ValidationException::withMessages([
                    'amount_received' => sprintf(
                        'Amount received (%.2f) exceeds the invoice\'s remaining balance (%.2f).',
                        $data['amount_received'],
                        $ar->remaining_balance
                    ),
                ]);
            }
        }

        $original = $collection->only(['receipt_number', 'amount_received', 'collection_date', 'deposit_date', 'cash_account_id']);

        DB::transaction(function () use ($collection, $data, $actor, $original) {
            $collection = Collection::query()->lockForUpdate()->findOrFail($collection->id);
            if ($collection->status !== Collection::STATUS_PENDING) {
                throw ValidationException::withMessages(['status' => 'Only unconfirmed collections can be edited.']);
            }

            if (\Illuminate\Support\Facades\Schema::hasTable('deposit_batch_items') && DB::table('deposit_batch_items')->where('collection_id',$collection->id)->exists()) {
                throw ValidationException::withMessages(['batch'=>'Cancel the deposit batch before changing this receipt.']);
            }
            if (isset($data['receipt_number']) && $data['receipt_number'] !== $collection->receipt_number) {
                throw ValidationException::withMessages(['receipt_number' => 'Keep the original issued receipt number. Cancel an incorrect record instead of replacing its receipt number.']);
            }
            if ($collection->receipt_journal_entry_id) {
                foreach ($data as $key => $value) {
                    if (in_array($key, ['deposit_date', 'reference_number', 'remarks'], true)) continue;
                    $current = $collection->getRawOriginal($key);
                    if ((string)$current !== (string)$value) throw ValidationException::withMessages(['receipt'=>'Verified receipt details are locked. Cancel with a reversal before replacing an incorrect receipt.']);
                }
            }
            $collection->update($data);

            AuditLog::create([
                'user_id'              => $actor->id,
                'module'               => 'Collections',
                'action'               => 'update',
                'record_id'            => $collection->id,
                'activity_description' => "Updated collection #{$collection->id}.",
                'old_values'           => $original,
                'new_values'           => $collection->only(['receipt_number', 'amount_received', 'collection_date', 'deposit_date', 'cash_account_id']),
                'ip_address'           => request()->ip(),
                'user_agent'           => request()->userAgent(),
            ]);
        });

        return $collection->refresh();
    }

    /** Verify a receipt into Undeposited Funds; the bank remains unchanged. */
    public function verifyReceipt(Collection $collection, User $actor, bool $checkCleared = false): Collection
    {
        return DB::transaction(function () use ($collection, $actor, $checkCleared) {
            $collection = Collection::query()->lockForUpdate()->findOrFail($collection->id);
            if (DB::table('deposit_batch_items')->where('collection_id',$collection->id)->exists()) {
                throw ValidationException::withMessages(['batch'=>'Verify this receipt with its deposit batch, or cancel the batch first.']);
            }
            if (!$collection->supportingDocuments()->whereNotNull('storage_path')->exists()) {
                throw ValidationException::withMessages(['proof'=>'Attach receipt evidence before verification.']);
            }
            app(CollectionPostingService::class)->receipt($collection,$actor,$checkCleared);
            DB::afterCommit(fn () => CollectionStatusChanged::dispatch($collection->refresh()));
            return $collection->refresh();
        });
    }

    public function confirm(Collection $collection, User $confirmedBy, bool $checkCleared = false, ?int $depositBatchId = null): Collection
    {
        if ($collection->status !== Collection::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => "Only pending collections can be confirmed (current status: {$collection->status}).",
            ]);
        }

        return DB::transaction(function () use ($collection, $confirmedBy, $checkCleared, $depositBatchId) {
            $collection = Collection::query()->lockForUpdate()->findOrFail($collection->id);
            if ($collection->status !== Collection::STATUS_PENDING) {
                throw ValidationException::withMessages(['status' => 'This collection has already been processed.']);
            }
            $membership = \Illuminate\Support\Facades\Schema::hasTable('deposit_batch_items') ? DB::table('deposit_batch_items')->where('collection_id',$collection->id)->value('deposit_batch_id') : null;
            if ($membership && (int)$membership !== $depositBatchId) {
                throw ValidationException::withMessages(['status'=>'Confirm this receipt through its deposit batch.']);
            }
            $batchProof = $membership && (int)$membership === $depositBatchId && \App\Models\DepositBatch::whereKey($depositBatchId)->where('status','Pending')->whereHas('documents',fn($q)=>$q->whereNotNull('storage_path'))->exists();
            if (! $collection->deposit_date) {
                throw ValidationException::withMessages(['deposit_date' => 'Record the deposit date before confirming this collection.']);
            }
            if (! $batchProof && ! $collection->supportingDocuments()->whereNotNull('storage_path')->exists()) {
                throw ValidationException::withMessages(['proof' => 'Attach supporting proof before confirming this collection.']);
            }
            if (strcasecmp($collection->payment_method, 'Check') === 0 && ! $checkCleared) {
                throw ValidationException::withMessages(['check_cleared' => 'Confirm that the bank has cleared this check.']);
            }
            // Separation of duties: whoever RECORDED the collection cannot also
            // CONFIRM it. This prevents a single admin from creating and
            // approving their own collection in one step.
            if ((int) $collection->created_by === (int) $confirmedBy->id) {
                throw ValidationException::withMessages([
                    'status' => 'You cannot confirm a collection you recorded yourself. Another authorized user must approve it.',
                ]);
            }

            /** @var AccountsReceivable $ar */
            $ar = AccountsReceivable::withTrashed()->lockForUpdate()->findOrFail($collection->ar_id);
            /** @var CashAccount $cashAccount */
            $cashAccount = CashAccount::query()->lockForUpdate()->findOrFail($collection->cash_account_id);

            $posting = app(CollectionPostingService::class);
            $cashBalanceBefore = $cashAccount->current_balance;
            if (!$collection->receipt_journal_entry_id) $posting->receipt($collection, $confirmedBy, $checkCleared);
            $ar->refresh();
            $newRemaining = $ar->remaining_balance;

            $cashAccount->update([
                'current_balance' => Money::add((string) $cashAccount->current_balance, (string) $collection->amount_received, 2),
            ]);

            $collection->update([
                'status'      => Collection::STATUS_CONFIRMED,
                'received_by' => $confirmedBy->id,
            ]);

            // Resolve the destination bank for the deposit transfer.
            $collection->load('cashAccount');

            $journalEntry = $posting->deposit($collection, $confirmedBy);

            // Broadcast to all users on the private-collections channel so
            // the Collections page auto-refreshes without a manual reload.
            DB::afterCommit(fn () => CollectionStatusChanged::dispatch($collection->refresh()));

            $collection->loadMissing(['collector', 'creator', 'accountsReceivable']);
            $collectorName = $collection->collector
                ? trim("{$collection->collector->first_name} {$collection->collector->last_name}")
                : ($collection->creator ? trim("{$collection->creator->first_name} {$collection->creator->last_name}") : 'Collector');
            if (empty($collectorName)) {
                $collectorName = 'Collector';
            }

            $formattedAmount = number_format((float) $collection->amount_received, 2);
            $invoiceNo = $ar->invoice_number ?? 'Invoice';
            $isPaidInFull = Money::comp($newRemaining, '0', 2) <= 0;

            if ($isPaidInFull) {
                $confirmTitle = 'Invoice Collected in Full';
                $confirmMessage = sprintf(
                    '%s successfully collected ₱%s for invoice %s — the invoice is now PAID IN FULL!',
                    $collectorName,
                    $formattedAmount,
                    $invoiceNo
                );
            } else {
                $remainingFormatted = number_format(max(0, (float) $newRemaining), 2);
                $confirmTitle = 'Collection Confirmed';
                $confirmMessage = sprintf(
                    '%s successfully collected ₱%s for invoice %s. Remaining balance: ₱%s.',
                    $collectorName,
                    $formattedAmount,
                    $invoiceNo,
                    $remainingFormatted
                );
            }

            $this->notifyStakeholders($collection, $confirmTitle, $confirmMessage, 'Success', true);

            AuditLog::create([
                'user_id'              => $confirmedBy->id,
                'module'               => 'Collections',
                'action'               => 'confirm',
                'record_id'            => $collection->id,
                'activity_description' => sprintf(
                    'Confirmed collection #%d: %.2f received against invoice %s into "%s". Invoice now %.2f remaining%s. Journal entry %s posted.',
                    $collection->id,
                    (float) $collection->amount_received,
                    $ar->invoice_number,
                    $cashAccount->account_name,
                    max(0, (float) $newRemaining),
                    Money::comp($newRemaining, '0', 2) <= 0 ? ' — PAID IN FULL' : '',
                    $journalEntry->transaction_no
                ),
                'new_values' => [
                    'check_cleared'        => strcasecmp($collection->payment_method, 'Check') === 0 ? $checkCleared : null,
                    'deposit_date'         => $collection->deposit_date?->toDateString(),
                    'amount_received'      => (float) $collection->amount_received,
                    'ar_id'                => $ar->id,
                    'ar_remaining_balance' => max(0, (float) $newRemaining),
                    'cash_account_id'      => $cashAccount->id,
                    'cash_balance_before'  => (float) $cashBalanceBefore,
                    'cash_balance_after'   => (float) $cashAccount->current_balance,
                    'journal_entry_id'     => $journalEntry->id,
                    'journal_entry_no'     => $journalEntry->transaction_no,
                ],
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $collection->refresh();
        });
    }

    public function cancel(Collection $collection, User $actor, ?string $remarks = null): Collection
    {
        if ($collection->status !== Collection::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => "Only pending collections can be cancelled (current status: {$collection->status}).",
            ]);
        }

        DB::transaction(function () use ($collection, $actor, $remarks) {
            $collection = Collection::query()->lockForUpdate()->findOrFail($collection->id);
            if ($collection->status !== Collection::STATUS_PENDING) throw ValidationException::withMessages(['status'=>'Only pending collections can be cancelled.']);
            if (\Illuminate\Support\Facades\Schema::hasTable('deposit_batch_items') && DB::table('deposit_batch_items')->where('collection_id',$collection->id)->exists()) {
                throw ValidationException::withMessages(['batch'=>'Cancel the deposit batch before changing this receipt.']);
            }

            app(CollectionPostingService::class)->reverseReceipt($collection, $actor, $remarks);
            $collection->update([
                'status'  => Collection::STATUS_CANCELLED,
                'remarks' => $remarks
                    ? trim(($collection->remarks ?? '') . "\n\n[Cancelled] {$remarks}")
                    : $collection->remarks,
            ]);

            // Broadcast so other users see the cancellation immediately.
            CollectionStatusChanged::dispatch($collection->refresh());

            $collection->loadMissing(['collector', 'creator', 'accountsReceivable']);
            $collectorName = $collection->collector
                ? trim("{$collection->collector->first_name} {$collection->collector->last_name}")
                : 'Collector';
            $actorName = trim("{$actor->first_name} {$actor->last_name}") ?: 'Admin';
            $formattedAmount = number_format((float) $collection->amount_received, 2);
            $invoiceNo = $collection->accountsReceivable?->invoice_number ?? 'Invoice';
            $receiptNo = $collection->receipt_number ?? $collection->reference_number ?? (string) $collection->id;

            $this->notifyStakeholders(
                $collection,
                'Collection Cancelled',
                sprintf(
                    'Collection receipt #%s for invoice %s (₱%s) by %s was cancelled by %s.%s',
                    $receiptNo,
                    $invoiceNo,
                    $formattedAmount,
                    $collectorName,
                    $actorName,
                    $remarks ? " Reason: {$remarks}" : ''
                ),
                'Warning',
                true
            );

            AuditLog::create([
                'user_id'              => $actor->id,
                'module'               => 'Collections',
                'action'               => 'cancel',
                'record_id'            => $collection->id,
                'activity_description' => $remarks
                    ? "Cancelled collection #{$collection->id}. Reason: {$remarks}"
                    : "Cancelled collection #{$collection->id}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });

        return $collection->refresh();
    }

    public function archive(Collection $collection, User $actor): void
    {
        DB::transaction(function () use ($collection, $actor) {
            // Set deleted_by before delete() so the boot hook guard in
            // Collection::booted() skips the saveQuietly() — one write,
            // correct actor, even during queued jobs where Auth::id()
            // might differ from $actor->id.
            $collection = Collection::query()->lockForUpdate()->findOrFail($collection->id);
            if ($collection->status === Collection::STATUS_PENDING && $collection->receipt_journal_entry_id) {
                throw ValidationException::withMessages(['receipt'=>'Deposit or reverse this verified receipt before archiving it.']);
            }
            $collection->deleted_by = $actor->id;
            $collection->save();
            $collection->delete();

            AuditLog::create([
                'user_id'              => $actor->id,
                'module'               => 'Collections',
                'action'               => 'archive',
                'record_id'            => $collection->id,
                'activity_description' => "Archived collection #{$collection->id}.",
                'ip_address'           => request()->ip(),
                'user_agent'           => request()->userAgent(),
            ]);
        });
    }

    public function restore(Collection $collection, User $actor): Collection
    {
        DB::transaction(function () use ($collection, $actor) {
            $collection->deleted_by = null;
            $collection->restore();

            AuditLog::create([
                'user_id'              => $actor->id,
                'module'               => 'Collections',
                'action'               => 'restore',
                'record_id'            => $collection->id,
                'activity_description' => "Restored collection #{$collection->id}.",
                'ip_address'           => request()->ip(),
                'user_agent'           => request()->userAgent(),
            ]);
        });

        return $collection->refresh();
    }

    /**
     * Aggregate team efficiency, bucketed by day/week/month/year.
     *
     * Replaces the per-collector variant — per-collector breakdown already
     * lives on the Collector page. This endpoint answers the fleet-level
     * question: did the whole collections team hit their combined target
     * this period?
     *
     * Target = SUM of monthly_target across all active collectors,
     * prorated to the bucket length. "Active" means not soft-deleted;
     * adjust the Collector query below if your model uses a different
     * active/inactive flag.
     *
     * Endpoint: GET /api/collections/efficiency?period=day|week|month|year&limit=12
     *
     * NOTE: uses PostgreSQL-specific to_char() — hard dependency on PostgreSQL.
     *
     * @return array<int, array{period:string,collected:float,target:float,efficiency:float}>
     */
    public function efficiency(string $granularity, int $limit = 12): array
    {
        $bucketExpr = match ($granularity) {
            'day'   => "to_char(collection_date, 'YYYY-MM-DD')",
            'week'  => "to_char(date_trunc('week', collection_date), 'YYYY-MM-DD')",
            'month' => "to_char(date_trunc('month', collection_date), 'YYYY-MM')",
            'year'  => "to_char(date_trunc('year', collection_date), 'YYYY')",
            default => throw ValidationException::withMessages([
                'period' => 'Period must be one of: day, week, month, year.',
            ]),
        };

        // Aggregate collected amounts across ALL collectors — no collector_id filter.
        $rows = Collection::query()
            ->selectRaw("{$bucketExpr} as period, SUM(amount_received) as collected")
            ->where('status', Collection::STATUS_CONFIRMED)
            ->groupByRaw($bucketExpr)
            ->orderByRaw("{$bucketExpr} DESC")
            ->limit($limit)
            ->get();

        // Combined monthly target = sum of every active collector's monthly_target.
        // This is the single number the whole team is measured against per period.
        $combinedMonthlyTarget = (float) Collector::query()->sum('monthly_target');

        $bucketTarget = match ($granularity) {
            'day'   => $combinedMonthlyTarget / 30,
            'week'  => $combinedMonthlyTarget / (30 / 7),
            'month' => $combinedMonthlyTarget,
            'year'  => $combinedMonthlyTarget * 12,
            default => $combinedMonthlyTarget,
        };

        return $rows->map(function ($row) use ($bucketTarget) {
            $collected  = (float) $row->collected;
            $efficiency = $bucketTarget > 0
                ? round(($collected / $bucketTarget) * 100, 2)
                : 0.0;

            return [
                'period'     => $row->period,
                'collected'  => $collected,
                'target'     => round($bucketTarget, 2),
                'efficiency' => $efficiency,
            ];
        })->values()->all();
    }

    /**
     * Attach a proof-of-receipt document to a collection.
     *
     * Allowed on Confirmed and Partially Paid AR collections — the receipt
     * exists once payment is received, not before. Re-uploading adds a new
     * version rather than replacing the previous one, so the full upload
     * history is preserved (same pattern as BudgetService::uploadPlan()).
     *
     * Storage path: collection-proofs/{collection_id}/{filename}
     * reference_type: 'collection' — consistent with DisbursementService
     * which uses 'disbursement' for the same table.
     */
    public function attachProof(Collection $collection, \Illuminate\Http\UploadedFile $file, User $actor): SupportingDocument
    {
        if (! in_array($collection->status, [Collection::STATUS_CONFIRMED, Collection::STATUS_PENDING])) {
            throw ValidationException::withMessages([
                'proof' => "Proof can only be attached to pending or confirmed collections (current status: {$collection->status}).",
            ]);
        }

        $path = $file->store("collection-proofs/{$collection->id}", FileStorage::DISK);

        $document = SupportingDocument::create([
            'reference_type' => 'collection',
            'reference_id'   => $collection->id,
            'file_name'      => basename($path),
            'original_name'  => $file->getClientOriginalName(),
            'storage_path'   => $path,
            'mime_type'      => $file->getClientMimeType(),
            'file_size'      => $file->getSize(),
            'uploaded_by'    => $actor->id,
            'uploaded_at'    => now(),
        ]);

        AuditLog::create([
            'user_id'              => $actor->id,
            'module'               => 'Collections',
            'action'               => 'attach_proof',
            'record_id'            => $collection->id,
            'activity_description' => "Attached proof of receipt \"{$file->getClientOriginalName()}\" to collection #{$collection->id}.",
            'ip_address'           => request()->ip(),
            'user_agent'           => request()->userAgent(),
        ]);

        return $document;
    }

    /**
     * Return all proof documents for a collection, newest first.
     * The first item in the list is the current/latest proof.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, SupportingDocument>
     */
    public function getProofHistory(Collection $collection): \Illuminate\Database\Eloquent\Collection
    {
        return SupportingDocument::query()
            ->with('uploader:id,first_name,last_name')
            ->where('reference_type', 'collection')
            ->where('reference_id', $collection->id)
            ->orderByDesc('uploaded_at')
            ->orderByDesc('id')
            ->get()
            ->map(function (SupportingDocument $doc) {
                $doc->uploaded_by_name = $doc->uploader
                    ? trim("{$doc->uploader->first_name} {$doc->uploader->last_name}")
                    : null;
                // has_file mirrors BudgetPlanHistoryModal's expectation —
                // true as long as storage_path is set.
                $doc->has_file = (bool) $doc->storage_path;
                return $doc;
            });
    }
    /**
     * Notifies whoever recorded the collection (created_by) that it was
     * confirmed or cancelled.
     *
     * NOTE: the notifications table has a CHECK constraint limiting type
     * to: Info, Success, Warning, Error. Module-specific types like
     * 'collection' are not supported at the DB level. 'Success' is used
     * for confirmation and 'Warning' for cancellation to carry the right
     * semantic weight within that constraint.
     *
     * The frontend's NOTIFICATION_TYPE_META keyed on 'collection' will
     * not match these — it will fall back to the default Bell/reports
     * route unless you either (a) add 'Success'/'Warning' entries to
     * NOTIFICATION_TYPE_META, or (b) add a separate module column to the
     * notifications table and use that for routing instead of type.
     */
    /**
     * Notifies collection stakeholders (creator, assigned collector, and system admins).
     *
     * notifications.type has a DB CHECK constraint limiting it to:
     * 'Info', 'Success', 'Warning', 'Error'.
     */
    private function notifyStakeholders(
        Collection $collection,
        string $title,
        string $message,
        string $type = 'Success',
        bool $notifyCreator = true
    ): void {
        $collection->loadMissing('collector');

        $recipientIds = [];

        if ($notifyCreator && $collection->created_by) {
            $recipientIds[] = (int) $collection->created_by;
        }

        if ($collection->collector?->user_id) {
            $recipientIds[] = (int) $collection->collector->user_id;
        }

        $adminIds = User::whereHas('role', function ($query) {
            $query->whereIn('name', ['admin', 'super-admin']);
        })->pluck('id')->all();

        foreach ($adminIds as $adminId) {
            $recipientIds[] = (int) $adminId;
        }

        $recipientIds = array_unique(array_filter($recipientIds));

        foreach ($recipientIds as $userId) {
            Notification::create([
                'user_id' => $userId,
                'title'   => $title,
                'message' => $message,
                'type'    => $type,
                'is_read' => false,
            ]);
        }
    }

    private function notifyCreator(Collection $collection, string $title, string $message, bool $confirmed = true): void
    {
        $this->notifyStakeholders(
            $collection,
            $title,
            $message,
            $confirmed ? 'Success' : 'Warning',
            true
        );
    }

    public static function generateReferenceNumber(): string
    {
        // Serialise concurrent generators — see the note on
        // AccountsReceivableService::generateReferenceNo().
        self::lockReferencePrefix('fms.reference.collections');

        $last = Collection::withTrashed()
            ->where('reference_number', 'like', 'REF-COL-%')
            ->orderByDesc('id')
            ->value('reference_number');

        $nextNum = 1;
        if ($last && preg_match('/REF-COL-(\d+)/i', $last, $matches)) {
            $nextNum = (int) $matches[1] + 1;
        } else {
            $count = Collection::withTrashed()->count();
            $nextNum = $count + 1;
        }

        while (Collection::withTrashed()->where('reference_number', sprintf('REF-COL-%03d', $nextNum))->exists()) {
            $nextNum++;
        }

        return sprintf('REF-COL-%03d', $nextNum);
    }
}