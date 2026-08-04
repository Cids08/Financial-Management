<?php

namespace App\Services;

use App\Models\Collector;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class CollectorService
{
    protected const PER_PAGE = 15;

    /**
     * @param array{search?: string, status?: string, archived?: bool} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = Collector::query();

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
            return Collector::create([
                ...$data,
                'status'     => ($data['is_active'] ?? true) ? 'Active' : 'Inactive',
                'updated_by' => $user->id,
            ]);
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

            return $collector->fresh();
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

            return $collector->fresh();
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

            return $collector->fresh();
        });
    }
}