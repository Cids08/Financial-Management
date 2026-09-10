<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class AuditLogQueryService
{
    protected const PER_PAGE = 20;

    // Safety cap on a single export — this is a read-only convenience
    // download, not a bulk data-extraction endpoint. If a filtered range
    // ever legitimately needs more than this, that's a sign the filters
    // should be narrowed (or this should become an async/queued export)
    // rather than raising the cap indefinitely.
    protected const EXPORT_LIMIT = 5000;

    /**
     * @param array{search?: string, module?: string, action?: string, user_id?: ?int, date_from?: string, date_to?: string} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        return $this->applyFilters(AuditLog::query(), $filters)->paginate(self::PER_PAGE);
    }

    /**
     * Unpaginated variant for CSV export — same filters (including
     * whatever date range the user currently has set on the page) as
     * list(), just without the page/per_page slicing, capped at
     * EXPORT_LIMIT rows so this can't turn into an unbounded query.
     *
     * @param array{search?: string, module?: string, action?: string, user_id?: ?int, date_from?: string, date_to?: string} $filters
     */
    public function exportList(array $filters): Collection
    {
        return $this->applyFilters(AuditLog::query(), $filters)
            ->limit(self::EXPORT_LIMIT)
            ->get();
    }

    /**
     * Shared filter logic for list()/exportList() — kept in one place so
     * the export can never silently drift from what the on-screen list
     * actually shows for the same filter values.
     */
    protected function applyFilters(Builder $query, array $filters): Builder
    {
        $query->with('user')->latest('created_at');

        if (! empty($filters['module'])) {
            $module = $filters['module'];
            $normalized = str_replace(' ', '', strtolower($module));
            $query->where(function ($q) use ($module, $normalized) {
                $q->where('module', $module)
                    ->orWhereRaw("REPLACE(LOWER(module), ' ', '') = ?", [$normalized]);
            });
        }

        if (! empty($filters['record_id'])) {
            $query->where('record_id', $filters['record_id']);
        }

        if (! empty($filters['action'])) {
            $query->where('action', $filters['action']);
        }

        if (! empty($filters['user_id'])) {
            $query->where('user_id', $filters['user_id']);
        }

        if (! empty($filters['date_from'])) {
            $query->whereDate('created_at', '>=', $filters['date_from']);
        }

        if (! empty($filters['date_to'])) {
            $query->whereDate('created_at', '<=', $filters['date_to']);
        }

        if (! empty($filters['search'])) {
            $term = $filters['search'];
            $query->where(function ($q) use ($term) {
                $q->where('activity_description', 'ilike', "%{$term}%")
                    ->orWhere('module', 'ilike', "%{$term}%")
                    ->orWhere('action', 'ilike', "%{$term}%");
            });
        }

        return $query;
    }

    /**
     * Distinct module names for the filter dropdown, so the frontend
     * doesn't have to hardcode a module list that drifts from what's
     * actually been logged.
     */
    public function distinctModules(): Collection
    {
        return AuditLog::query()
            ->whereNotNull('module')
            ->distinct()
            ->orderBy('module')
            ->pluck('module');
    }
}