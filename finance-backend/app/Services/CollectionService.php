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
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CollectionService
{
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

        if (! empty($filters['trashed'])) {
            $query->onlyTrashed();
        }

        $query
            ->search($filters['search'] ?? null)
            ->forCollector($filters['collector_id'] ?? null)
            ->status($filters['status'] ?? null);

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

            if ((int) $ar->collector_id !== (int) $data['collector_id']) {
                throw ValidationException::withMessages([
                    'collector_id' => $ar->collector_id
                        ? "Invoice {$ar->invoice_number} is assigned to a different collector."
                        : "Invoice {$ar->invoice_number} has no collector assigned yet — assign it before recording a collection.",
                ]);
            }

            if (bccomp((string) $data['amount_received'], (string) $ar->remaining_balance, 2) > 0) {
                throw ValidationException::withMessages([
                    'amount_received' => sprintf(
                        'Amount received (%.2f) exceeds the invoice\'s remaining balance (%.2f).',
                        $data['amount_received'],
                        $ar->remaining_balance
                    ),
                ]);
            }

            $collection = Collection::create([
                ...$data,
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

        $original = $collection->only(['amount_received', 'collection_date', 'cash_account_id']);

        DB::transaction(function () use ($collection, $data, $actor, $original) {
            $collection->update($data);

            AuditLog::create([
                'user_id'              => $actor->id,
                'module'               => 'Collections',
                'action'               => 'update',
                'record_id'            => $collection->id,
                'activity_description' => "Updated collection #{$collection->id}.",
                'old_values'           => $original,
                'new_values'           => $collection->only(['amount_received', 'collection_date', 'cash_account_id']),
                'ip_address'           => request()->ip(),
                'user_agent'           => request()->userAgent(),
            ]);
        });

        return $collection->refresh();
    }

    /**
     * Applies the collection: reduces the invoice's remaining balance,
     * credits the cash account, marks the AR Paid/Partial, and posts
     * the double-entry journal entry. Mirrors ExpenseService::approve()'s
     * locking pattern.
     */
    public function confirm(Collection $collection, User $confirmedBy): Collection
    {
        if ($collection->status !== Collection::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => "Only pending collections can be confirmed (current status: {$collection->status}).",
            ]);
        }

        return DB::transaction(function () use ($collection, $confirmedBy) {
            /** @var AccountsReceivable $ar */
            $ar = AccountsReceivable::query()->lockForUpdate()->findOrFail($collection->ar_id);
            /** @var CashAccount $cashAccount */
            $cashAccount = CashAccount::query()->lockForUpdate()->findOrFail($collection->cash_account_id);

            $newPaid           = bcadd((string) $ar->paid_amount, (string) $collection->amount_received, 2);
            $newRemaining      = bcsub((string) $ar->original_amount, $newPaid, 2);
            $cashBalanceBefore = $cashAccount->current_balance;

            $ar->update([
                'paid_amount'       => $newPaid,
                'remaining_balance' => max('0.00', $newRemaining),
                'status'            => bccomp($newRemaining, '0', 2) <= 0 ? 'Paid' : 'Partially Paid',
            ]);

            $cashAccount->update([
                'current_balance' => bcadd((string) $cashAccount->current_balance, (string) $collection->amount_received, 2),
            ]);

            $collection->update([
                'status'      => Collection::STATUS_CONFIRMED,
                'received_by' => $confirmedBy->id,
            ]);

            // Load cashAccount onto the collection so postJournalEntry()
            // can read account_code without an extra query.
            $collection->load('cashAccount');

            $journalEntry = $this->postJournalEntry($collection, $ar, $confirmedBy);

            // Broadcast to all users on the private-collections channel so
            // the Collections page auto-refreshes without a manual reload.
            CollectionStatusChanged::dispatch($collection->refresh());

            $this->notifyCreator($collection, 'Collection confirmed', sprintf(
                'Your collection #%d (%.2f against invoice %s) was confirmed.',
                $collection->id,
                (float) $collection->amount_received,
                $ar->invoice_number
            ), true);

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
                    bccomp($newRemaining, '0', 2) <= 0 ? ' — PAID IN FULL' : '',
                    $journalEntry->transaction_no
                ),
                'new_values' => [
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
            $collection->update([
                'status'  => Collection::STATUS_CANCELLED,
                'remarks' => $remarks
                    ? trim(($collection->remarks ?? '') . "\n\n[Cancelled] {$remarks}")
                    : $collection->remarks,
            ]);

            // Broadcast so other users see the cancellation immediately.
            CollectionStatusChanged::dispatch($collection->refresh());

            $this->notifyCreator($collection, 'Collection cancelled', sprintf(
                'Your collection #%d was cancelled.%s',
                $collection->id,
                $remarks ? " Reason: {$remarks}" : ''
            ), false);

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
     * Posts the double-entry journal for a confirmed collection:
     *
     *   Dr  Cash / Bank  — the chart_of_accounts row whose account_code
     *                      matches cash_accounts.account_code with the
     *                      "CA-" prefix stripped (e.g. CA-1010 → 1010).
     *   Cr  Accounts Receivable control — the single chart_of_accounts
     *                      row whose account_name = 'Accounts Receivable'
     *                      (account_code 1100, id 5).
     *
     * No config map, no hardcoded IDs. Both sides are resolved from the
     * DB at confirm-time so adding a new cash account never requires a
     * code change — just seed a matching chart_of_accounts row.
     */
    private function postJournalEntry(
        Collection $collection,
        AccountsReceivable $ar,
        User $confirmedBy
    ): JournalEntry {
        // cash_accounts.account_code is "CA-XXXX"; the matching
        // chart_of_accounts row uses just "XXXX" as its account_code.
        // str_replace used intentionally — ltrim would strip individual
        // characters ('C','A','-') not the prefix as a whole, which would
        // corrupt codes like CA-0010 (leading zero stripped).
        $chartCode = str_replace('CA-', '', $collection->cashAccount->account_code);

        $cashChartAccount = ChartOfAccount::where('account_code', $chartCode)
            ->where('is_active', true)
            ->first();

        if (! $cashChartAccount) {
            throw ValidationException::withMessages([
                'finance' => "No active chart-of-accounts entry found for cash account "
                    . "\"{$collection->cashAccount->account_name}\" "
                    . "(looked up code: {$chartCode}). "
                    . "Add a chart_of_accounts row with account_code = {$chartCode} to fix this.",
            ]);
        }

        // AR control account is the single "Accounts Receivable" row
        // (account_code 1100) — resolved by name so it works even if
        // the code ever changes.
        $arChartAccount = ChartOfAccount::where('account_name', 'Accounts Receivable')
            ->where('is_active', true)
            ->first();

        if (! $arChartAccount) {
            throw ValidationException::withMessages([
                'finance' => 'No active chart-of-accounts entry found with account_name '
                    . '"Accounts Receivable". Check your chart_of_accounts table.',
            ]);
        }

        $entry = JournalEntry::create([
            'transaction_no'   => 'JE-COL-' . $collection->id . '-' . now()->format('YmdHis'),
            'transaction_date' => $collection->collection_date,
            'description'      => sprintf(
                'Collection #%d confirmed — %.2f received against invoice %s',
                $collection->id,
                (float) $collection->amount_received,
                $ar->invoice_number
            ),
            'status'     => 'Posted',
            'posted_by'  => $confirmedBy->id,
            'posted_at'  => now(),
            'created_by' => $confirmedBy->id,
        ]);

        $entry->lines()->createMany([
            [
                // Cash/Bank increases — asset debit
                'account_id'     => $cashChartAccount->id,
                'debit'          => $collection->amount_received,
                'credit'         => '0.00',
                'reference_type' => 'Collections',
                'reference_id'   => $collection->id,
                'remarks'        => "Cash received — invoice {$ar->invoice_number}",
            ],
            [
                // AR control decreases — asset credit (reducing what's owed)
                'account_id'     => $arChartAccount->id,
                'debit'          => '0.00',
                'credit'         => $collection->amount_received,
                'reference_type' => 'Collections',
                'reference_id'   => $collection->id,
                'remarks'        => "AR settled — invoice {$ar->invoice_number}",
            ],
        ]);

        return $entry;
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
    private function notifyCreator(Collection $collection, string $title, string $message, bool $confirmed = true): void
    {
        if (! $collection->created_by) {
            return;
        }

        Notification::create([
            'user_id' => $collection->created_by,
            'title'   => $title,
            'message' => $message,
            'type'    => $confirmed ? 'Success' : 'Warning',
            'is_read' => false,
        ]);
    }
}