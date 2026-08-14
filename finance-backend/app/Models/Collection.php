<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Auth;

class Collection extends Model
{
    use HasFactory, SoftDeletes;

    // Assumed enum values — the ERD only fixes the column default
    // ('Pending'); adjust these to match your real status set if it
    // differs (e.g. if "Deposited" replaces "Confirmed").
    public const STATUS_PENDING = 'Pending';
    public const STATUS_CONFIRMED = 'Confirmed';
    public const STATUS_CANCELLED = 'Cancelled';

    protected $fillable = [
        'ar_id',
        'collector_id',
        'cash_account_id',
        'receipt_number',
        'or_number',
        'collection_date',
        'deposit_date',
        'amount_received',
        'payment_method',
        'reference_number',
        'status',
        'received_by',
        'remarks',
        'created_by',
    ];

    protected $casts = [
        'collection_date' => 'date',
        'deposit_date' => 'date',
        'amount_received' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::deleting(function (Collection $collection) {
            if (! $collection->isForceDeleting()) {
                $collection->deleted_by = Auth::id();
                $collection->saveQuietly();
            }
        });
    }

    public function accountsReceivable(): BelongsTo
    {
        return $this->belongsTo(AccountsReceivable::class, 'ar_id');
    }

    public function collector(): BelongsTo
    {
        return $this->belongsTo(Collector::class);
    }

    public function cashAccount(): BelongsTo
    {
        return $this->belongsTo(CashAccount::class);
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function deleter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('receipt_number', 'ilike', "%{$term}%")
                ->orWhere('or_number', 'ilike', "%{$term}%")
                ->orWhere('reference_number', 'ilike', "%{$term}%");
        });
    }

    public function scopeForCollector(Builder $query, ?int $collectorId): Builder
    {
        return $collectorId ? $query->where('collector_id', $collectorId) : $query;
    }

    public function scopeStatus(Builder $query, ?string $status): Builder
    {
        return $status ? $query->where('status', $status) : $query;
    }
}