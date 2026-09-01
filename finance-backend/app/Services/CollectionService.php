<?php

namespace App\Services;

use App\Models\AccountsReceivable;
use App\Models\AuditLog;
use App\Models\CashAccount;
use App\Models\Collection;
use App\Models\Collector;
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
            ->with(['accountsReceivable:id,invoice_number', 'collector:id,first_name,last_name', 'cashAccount:id,account_name']);

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
                'status' => Collection::STATUS_PENDING,
                'created_by' => $creator->id,
            ]);

            AuditLog::create([
                'user_id' => $creator->id,
                'module' => 'Collections',
                'action' => 'create',
                'record_id' => $collection->id,
                'activity_description' => "Recorded collection #{$collection->id} against invoice {$ar->invoice_number}.",
                'new_values' => $collection->only(['ar_id', 'collector_id', 'amount_received', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
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
                'user_id' => $actor->id,
                'module' => 'Collections',
                'action' => 'update',
                'record_id' => $collection->id,
                'activity_description' => "Updated collection #{$collection->id}.",
                'old_values' => $original,
                'new_values' => $collection->only(['amount_received', 'collection_date', 'cash_account_id']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });

        return $collection->refresh();
    }

    /**
     * Applies the collection: reduces the invoice's remaining balance,
     * credits the cash account, and marks the AR Paid/Partial. Mirrors
     * ExpenseService::approve()'s locking pattern.
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

            $newPaid = bcadd((string) $ar->paid_amount, (string) $collection->amount_received, 2);
            $newRemaining = bcsub((string) $ar->original_amount, $newPaid, 2);
            $cashBalanceBefore = $cashAccount->current_balance;

            $ar->update([
                'paid_amount' => $newPaid,
                'remaining_balance' => max('0.00', $newRemaining),
                'status' => bccomp($newRemaining, '0', 2) <= 0 ? 'Paid' : 'Partial',
            ]);

            $cashAccount->update([
                'current_balance' => bcadd((string) $cashAccount->current_balance, (string) $collection->amount_received, 2),
            ]);

            $collection->update([
                'status' => Collection::STATUS_CONFIRMED,
                'received_by' => $confirmedBy->id,
            ]);

            $this->notifyCreator($collection, 'Collection confirmed', sprintf(
                'Your collection #%d (%.2f against invoice %s) was confirmed.',
                $collection->id,
                (float) $collection->amount_received,
                $ar->invoice_number
            ));

            // Same reasoning as DisbursementService::release() — this moves
            // real money (into a cash account this time, not out), so the
            // log needs the actual financial picture, not just "confirmed".
            AuditLog::create([
                'user_id' => $confirmedBy->id,
                'module' => 'Collections',
                'action' => 'confirm',
                'record_id' => $collection->id,
                'activity_description' => sprintf(
                    'Confirmed collection #%d: %.2f received against invoice %s into "%s". Invoice now %.2f remaining%s.',
                    $collection->id,
                    (float) $collection->amount_received,
                    $ar->invoice_number,
                    $cashAccount->account_name,
                    max(0, (float) $newRemaining),
                    bccomp($newRemaining, '0', 2) <= 0 ? ' — PAID IN FULL' : ''
                ),
                'new_values' => [
                    'amount_received' => (float) $collection->amount_received,
                    'ar_id' => $ar->id,
                    'ar_remaining_balance' => max(0, (float) $newRemaining),
                    'cash_account_id' => $cashAccount->id,
                    'cash_balance_before' => (float) $cashBalanceBefore,
                    'cash_balance_after' => (float) $cashAccount->current_balance,
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
                'status' => Collection::STATUS_CANCELLED,
                'remarks' => $remarks ? trim(($collection->remarks ?? '') . "\n\n[Cancelled] {$remarks}") : $collection->remarks,
            ]);

            $this->notifyCreator($collection, 'Collection cancelled', sprintf(
                'Your collection #%d was cancelled.%s',
                $collection->id,
                $remarks ? " Reason: {$remarks}" : ''
            ));

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Collections',
                'action' => 'cancel',
                'record_id' => $collection->id,
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
            // Previously never set — restore() clears this back to null,
            // but nothing populated it on the way in, so every archived
            // collection showed no record of who archived it.
            $collection->deleted_by = $actor->id;
            $collection->save();
            $collection->delete();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Collections',
                'action' => 'archive',
                'record_id' => $collection->id,
                'activity_description' => "Archived collection #{$collection->id}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    public function restore(Collection $collection, User $actor): Collection
    {
        DB::transaction(function () use ($collection, $actor) {
            $collection->deleted_by = null;
            $collection->restore();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Collections',
                'action' => 'restore',
                'record_id' => $collection->id,
                'activity_description' => "Restored collection #{$collection->id}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });

        return $collection->refresh();
    }

    /**
     * Feature 2: collector efficiency, bucketed by day/week/month/year.
     * Efficiency = collected / target for that bucket, where the
     * monthly_target is prorated down to the bucket's length.
     *
     * @return array<int, array{period:string,collected:float,target:float,efficiency:float}>
     */
    public function efficiency(Collector $collector, string $granularity, int $limit = 12): array
    {
        $bucketExpr = match ($granularity) {
            'day' => "to_char(collection_date, 'YYYY-MM-DD')",
            'week' => "to_char(date_trunc('week', collection_date), 'YYYY-MM-DD')",
            'month' => "to_char(date_trunc('month', collection_date), 'YYYY-MM')",
            'year' => "to_char(date_trunc('year', collection_date), 'YYYY')",
            default => throw ValidationException::withMessages([
                'period' => 'Period must be one of: day, week, month, year.',
            ]),
        };

        $rows = Collection::query()
            ->selectRaw("{$bucketExpr} as period, SUM(amount_received) as collected")
            ->where('collector_id', $collector->id)
            ->where('status', Collection::STATUS_CONFIRMED)
            ->groupByRaw($bucketExpr)
            ->orderByRaw("{$bucketExpr} DESC")
            ->limit($limit)
            ->get();

        $monthlyTarget = (float) $collector->monthly_target;
        $bucketTarget = match ($granularity) {
            'day' => $monthlyTarget / 30,
            'week' => $monthlyTarget / (30 / 7),
            'month' => $monthlyTarget,
            'year' => $monthlyTarget * 12,
            default => $monthlyTarget,
        };

        return $rows->map(function ($row) use ($bucketTarget) {
            $collected = (float) $row->collected;
            $efficiency = $bucketTarget > 0 ? round(($collected / $bucketTarget) * 100, 2) : 0.0;

            return [
                'period' => $row->period,
                'collected' => $collected,
                'target' => round($bucketTarget, 2),
                'efficiency' => $efficiency,
            ];
        })->values()->all();
    }

    /**
     * Notifies whoever recorded the collection (created_by) that it was
     * confirmed or cancelled. `type` is 'collection' — NOT currently in
     * NOTIFICATION_TYPE_META on the frontend (src/utils/notificationTypes.js),
     * so it renders with the default Bell icon/route to /reports until
     * that map gets a 'collection' entry.
     */
    private function notifyCreator(Collection $collection, string $title, string $message): void
    {
        if (! $collection->created_by) {
            return;
        }

        Notification::create([
            'user_id' => $collection->created_by,
            'title' => $title,
            'message' => $message,
            'type' => 'collection',
            'is_read' => false,
        ]);
    }
}