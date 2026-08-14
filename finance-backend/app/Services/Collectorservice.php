<?php

namespace App\Services;

use App\Models\Collection as CollectionModel; // aliased — collides with Illuminate\Support\Collection
use App\Models\Collector;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Support\Facades\DB;

class CollectorService
{
    protected const PER_PAGE = 15;

    /**
     * @param array{search?: string, status?: string, archived?: bool} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = Collector::query()->with('serviceArea');

        // Mirrors the frontend's "Show archived" checkbox: archived and
        // active collectors are two disjoint views, never mixed.
        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        if (! empty($filters['status']) && in_array($filters['status'], ['active', 'inactive'], true)) {
            $query->where('status', $filters['status'] === 'active' ? 'Active' : 'Inactive');
        }

        $query->search($filters['search'] ?? null)->latest();

        return $query->paginate(self::PER_PAGE);
    }

    public function create(User $user, array $data): Collector
    {
        return DB::transaction(function () use ($user, $data) {
            $collector = Collector::create([
                ...$data,
                'status'     => ($data['is_active'] ?? true) ? 'Active' : 'Inactive',
                'updated_by' => $user->id,
            ]);

            return $collector->load('serviceArea');
        });
    }

    public function update(User $user, Collector $collector, array $data): Collector
    {
        return DB::transaction(function () use ($user, $collector, $data) {
            $collector->update([
                ...$data,
                'status'     => array_key_exists('is_active', $data)
                    ? ($data['is_active'] ? 'Active' : 'Inactive')
                    : $collector->status,
                'updated_by' => $user->id,
            ]);

            return $collector->fresh('serviceArea');
        });
    }

    /**
     * Archive: soft delete + force Inactive, matching the mock's
     * `toggleArchive` behavior exactly (archiving always deactivates).
     */
    public function archive(User $user, Collector $collector): Collector
    {
        return DB::transaction(function () use ($user, $collector) {
            $collector->update(['status' => 'Inactive', 'deleted_by' => $user->id]);
            $collector->delete();

            return $collector->fresh('serviceArea');
        });
    }

    /**
     * Restore: un-delete only. Status intentionally stays whatever it
     * was (Inactive) — same as the mock, which doesn't auto-reactivate
     * on restore. The user re-activates explicitly via edit.
     */
    public function restore(User $user, Collector $collector): Collector
    {
        return DB::transaction(function () use ($user, $collector) {
            $collector->restore();
            $collector->update(['updated_by' => $user->id]);

            return $collector->fresh('serviceArea');
        });
    }

    /**
     * Efficiency = confirmed collections vs. the collector's
     * monthly_target, scaled to whatever bucket size $period asks for,
     * across several recent buckets (so the modal renders a trend list,
     * not just one number).
     *
     * status = 'Confirmed' is an ASSUMPTION, not verified against a DB
     * CHECK constraint on collections.status the way collector.status
     * ('Active'/'Inactive', used above) effectively already is by this
     * class's own working code. If every bucket comes back with
     * collected = 0 despite real confirmed collections existing, this
     * is the first thing to check — run:
     *   SELECT pg_get_constraintdef(oid) FROM pg_constraint
     *   WHERE conname = 'collections_status_check';
     * and adjust the string below if 'Confirmed' isn't correct.
     */
    public function getEfficiency(Collector $collector, string $period): SupportCollection
    {
        [$bucketCount, $unit] = match ($period) {
            'day' => [14, 'day'],
            'week' => [8, 'week'],
            'month' => [6, 'month'],
            'year' => [3, 'year'],
            default => [6, 'month'],
        };

        $monthlyTarget = (float) $collector->monthly_target;
        $today = Carbon::today();

        // Build buckets oldest-first.
        $ranges = [];
        for ($i = $bucketCount - 1; $i >= 0; $i--) {
            $start = match ($unit) {
                'day' => $today->copy()->subDays($i)->startOfDay(),
                'week' => $today->copy()->subWeeks($i)->startOfWeek(),
                'month' => $today->copy()->subMonthsNoOverflow($i)->startOfMonth(),
                'year' => $today->copy()->subYears($i)->startOfYear(),
            };
            $end = match ($unit) {
                'day' => $start->copy()->endOfDay(),
                'week' => $start->copy()->endOfWeek(),
                'month' => $start->copy()->endOfMonth(),
                'year' => $start->copy()->endOfYear(),
            };
            $ranges[] = [$start, $end];
        }

        $earliestStart = $ranges[0][0];

        $rows = CollectionModel::where('collector_id', $collector->id)
            ->where('status', 'Confirmed') // UNVERIFIED — see docblock above
            ->where('collection_date', '>=', $earliestStart)
            ->get(['collection_date', 'amount_received']);

        $buckets = collect();

        foreach ($ranges as [$start, $end]) {
            $collected = $rows
                ->filter(fn ($r) => $r->collection_date >= $start && $r->collection_date <= $end)
                ->sum('amount_received');

            // Target scaled to the bucket's actual length rather than a
            // flat divisor, so a 31-day month isn't shortchanged vs. 28.
            $daysInBucket = $start->diffInDays($end) + 1;
            $target = match ($unit) {
                'month' => $monthlyTarget,
                'year' => $monthlyTarget * 12,
                default => $monthlyTarget * $daysInBucket / 30.44, // avg days/month
            };

            $label = match ($unit) {
                'day' => $start->format('M j'),
                'week' => 'Week of ' . $start->format('M j'),
                'month' => $start->format('M Y'),
                'year' => $start->format('Y'),
            };

            $buckets->push([
                'period' => $label,
                'collected' => round((float) $collected, 2),
                'target' => round($target, 2),
                'efficiency' => $target > 0 ? (int) round(((float) $collected / $target) * 100) : 0,
            ]);
        }

        return $buckets;
    }
}