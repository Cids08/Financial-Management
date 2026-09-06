<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'supplier_code',
        'supplier_name',
        'contact_person',
        'position',
        'contact_number',
        'email',
        'website',
        'address',
        'current_balance',
        'status',
        'updated_by',
    ];

    protected $casts = [
        'current_balance' => 'decimal:2',
    ];

    protected static function booted(): void
    {
        static::creating(function (Supplier $supplier) {
            $supplier->supplier_code ??= static::nextCode();
        });
    }

    public static function nextCode(): string
    {
        $last = static::withTrashed()->orderByDesc('id')->value('id') ?? 0;

        return 'SUPP-' . str_pad((string) ($last + 1), 5, '0', STR_PAD_LEFT);
    }

    /**
     * Recomputes and persists current_balance from the supplier's actual
     * AP bills, mirroring Customer::recalculateBalance() exactly. Called
     * from AccountsPayable's booted() hooks.
     *
     * Excludes 'Paid' (nothing left owed) and 'Cancelled' bills — matches
     * AccountsPayableService::stats()'s own 'payable' metric and its
     * documented reasoning: a Cancelled bill can still carry a nonzero
     * remaining_balance since cancelling doesn't zero that column out,
     * so it must be excluded explicitly rather than trusting
     * remaining_balance alone (unlike AR, where remaining_balance reaching
     * 0 was sufficient on its own).
     *
     * Soft-deleted/archived bills are excluded automatically by
     * AccountsPayable's SoftDeletes global scope — no explicit
     * whereNull('deleted_at') needed here.
     */
    public static function recalculateBalance(int $supplierId): void
    {
        $balance = AccountsPayable::where('supplier_id', $supplierId)
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->sum('remaining_balance');

        static::where('id', $supplierId)->update(['current_balance' => $balance]);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('supplier_name', 'ILIKE', "%{$term}%")
                ->orWhere('email', 'ILIKE', "%{$term}%")
                ->orWhere('contact_person', 'ILIKE', "%{$term}%");
        });
    }
}