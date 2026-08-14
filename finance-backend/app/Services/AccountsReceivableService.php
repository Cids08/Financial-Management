<?php

namespace App\Services;

use App\Models\AccountsReceivable;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class AccountsReceivableService
{
    /**
     * $filters: ['status' => ?string, 'archived' => bool, 'search' => ?string]
     * Matches the filter behavior already implemented client-side in
     * AccountsReceivable.jsx's `filtered` useMemo, moved server-side.
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
            $penaltyRate = $data['penalty_rate'] ?? 0;
            $penaltyAmount = $penaltyRate > 0
                ? round(($data['original_amount'] * $penaltyRate) / 100, 2)
                : 0;

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
                'reference_no' => $data['reference_no'] ?? null,
                'penalty_rate' => $penaltyRate,
                'penalty_amount' => $penaltyAmount,
                'remarks' => $data['remarks'] ?? null,
                'status' => $data['status'],
                'created_by' => $actor->id,
                'is_archived' => false,
            ]);

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
            $penaltyRate = $data['penalty_rate'] ?? 0;
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

    /**
     * Flips is_archived, matching the single toggle button in the frontend
     * (Archive / RotateCcw icon on the same action).
     */
    public function toggleArchive(User $actor, AccountsReceivable $ar): AccountsReceivable
    {
        return DB::transaction(function () use ($actor, $ar) {
            $nextArchived = ! $ar->is_archived;

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
}