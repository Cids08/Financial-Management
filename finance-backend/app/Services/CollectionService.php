<?php

namespace App\Services;

use App\Models\AccountsReceivable;
use App\Models\CashAccount;
use App\Models\Collection;
use App\Models\Collector;
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

            return Collection::create([
                ...$data,
                'status' => Collection::STATUS_PENDING,
                'created_by' => $creator->id,
            ]);
        });
    }

    public function update(Collection $collection, array $data): Collection
    {
        if ($collection->status === Collection::STATUS_CONFIRMED) {
            throw ValidationException::withMessages([
                'status' => 'Confirmed collections cannot be edited directly.',
            ]);
        }

        DB::transaction(function () use ($collection, $data) {
            $collection->update($data);
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

            return $collection->refresh();
        });
    }

    public function cancel(Collection $collection, ?string $remarks = null): Collection
    {
        if ($collection->status !== Collection::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => "Only pending collections can be cancelled (current status: {$collection->status}).",
            ]);
        }

        DB::transaction(function () use ($collection, $remarks) {
            $collection->update([
                'status' => Collection::STATUS_CANCELLED,
                'remarks' => $remarks ? trim(($collection->remarks ?? '') . "\n\n[Cancelled] {$remarks}") : $collection->remarks,
            ]);
        });

        return $collection->refresh();
    }

    public function archive(Collection $collection): void
    {
        DB::transaction(fn () => $collection->delete());
    }

    public function restore(Collection $collection): Collection
    {
        DB::transaction(function () use ($collection) {
            $collection->deleted_by = null;
            $collection->restore();
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
}