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

    // Status constants — 'Voided' is intentionally absent. The frontend's
    // STATUS_OPTIONS currently includes 'Voided' but the backend has no
    // STATUS_VOIDED constant and no void workflow. Until a proper void
    // flow is designed (with its own endpoint, reversal logic, and journal
    // entry), status changes must go through cancel() — not a free-form
    // edit. The frontend dropdown should be restricted accordingly.
    public const STATUS_PENDING   = 'Pending';
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
        'deposit_date'    => 'date',
        'amount_received' => 'decimal:2',
        'created_at'      => 'datetime',
        'updated_at'      => 'datetime',
        'deleted_at'      => 'datetime',
    ];

    protected static function booted(): void
    {
        static::deleting(function (Collection $collection) {
            if ($collection->isForceDeleting()) {
                return;
            }

            // Guard: only write deleted_by if the service hasn't already
            // set it explicitly (e.g. CollectionService::archive() sets
            // $collection->deleted_by = $actor->id before calling delete()).
            // This prevents a double-write and ensures the correct actor
            // is recorded even when Auth::id() differs from the actor
            // (e.g. during queued jobs or admin-on-behalf-of flows).
            if (! $collection->deleted_by) {
                $collection->deleted_by = Auth::id();
                $collection->saveQuietly();
            }
        });
    }

    // -------------------------------------------------------------------------
    // Relationships
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /**
     * Searches receipt_number, or_number, and reference_number on the
     * collections table itself, plus customer_name through the AR →
     * Customer relationship, and first_name / last_name through the
     * Collector relationship.
     *
     * The customer join goes through accountsReceivable because collections
     * has no direct customer_id — confirmed by the ERD:
     *   collections.ar_id → accounts_receivable.id → customers.customer_id
     *
     * Collector columns confirmed from ERD: first_name, last_name (no
     * single name column).
     *
     * NOTE: uses PostgreSQL-specific ilike — hard dependency on PostgreSQL.
     */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('receipt_number', 'ilike', "%{$term}%")
                ->orWhere('or_number', 'ilike', "%{$term}%")
                ->orWhere('reference_number', 'ilike', "%{$term}%")
                ->orWhereHas('accountsReceivable.customer', function (Builder $q) use ($term) {
                    $q->where('customer_name', 'ilike', "%{$term}%");
                })
                ->orWhereHas('collector', function (Builder $q) use ($term) {
                    $q->where('first_name', 'ilike', "%{$term}%")
                        ->orWhere('last_name', 'ilike', "%{$term}%");
                });
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