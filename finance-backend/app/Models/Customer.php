<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Customer extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'customer_code',
        'customer_name',
        'contact_person',
        'position',
        'contact_number',
        'email',
        'address',
        'industry',
        'credit_limit',
        'current_balance',
        'status',
        'updated_by',
    ];

    protected $casts = [
        'credit_limit' => 'decimal:2',
        'current_balance' => 'decimal:2',
    ];

    protected static function booted(): void
    {
        static::creating(function (Customer $customer) {
            $customer->customer_code ??= static::nextCode();
        });
    }

    public static function nextCode(): string
    {
        $last = static::withTrashed()->orderByDesc('id')->value('id') ?? 0;

        return 'CUST-' . str_pad((string) ($last + 1), 5, '0', STR_PAD_LEFT);
    }

    /**
     * Recomputes and persists current_balance from the customer's actual
     * AR records, rather than trusting any caller to keep the stored
     * column in sync by hand. Called from AccountsReceivable's booted()
     * hooks (saved/deleted/restored) — this is the single source of
     * truth for what current_balance should be.
     *
     * Sums remaining_balance for AR rows that are not archived (matches
     * the same is_archived exclusion PythonArimaForecastEngine uses for
     * its own AR reconstruction) and not soft-deleted (excluded
     * automatically by AccountsReceivable's SoftDeletes global scope —
     * no explicit whereNull('deleted_at') needed here).
     */
    public static function recalculateBalance(int $customerId): void
    {
        $balance = AccountsReceivable::where('customer_id', $customerId)
            ->where('is_archived', false)
            ->sum('remaining_balance');

        static::where('id', $customerId)->update(['current_balance' => $balance]);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('customer_name', 'ILIKE', "%{$term}%")
                ->orWhere('email', 'ILIKE', "%{$term}%")
                ->orWhere('contact_person', 'ILIKE', "%{$term}%");
        });
    }
}