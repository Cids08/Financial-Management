<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Matches the `accounts_receivable` table exactly as defined in the ERD.
 * Archiving is handled via Laravel's native soft deletes (deleted_at /
 * deleted_by) — there is no separate is_archived boolean column.
 */
class AccountsReceivable extends Model
{
    use SoftDeletes;

    protected $table = 'accounts_receivable';

    protected $fillable = [
        'customer_id',
        'collector_id',
        'invoice_number',
        'invoice_date',
        'due_date',
        'original_amount',
        'paid_amount',
        'remaining_balance',
        'payment_method',
        'payment_terms',
        'purchase_order_no',
        'reference_no',
        'remarks',
        'status',
        'penalty_rate',
        'penalty_amount',
        'created_by',
        'deleted_by',
        'is_archived',
        'archived_at',
        'archived_by',
    ];

    protected $casts = [
        'invoice_date' => 'date',
        'due_date' => 'date',
        'original_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'remaining_balance' => 'decimal:2',
        'penalty_rate' => 'decimal:2',
        'penalty_amount' => 'decimal:2',
        'is_archived' => 'boolean',
        'archived_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        // Fires for every create/update on this model, regardless of
        // which service triggered it (AccountsReceivableService::create/
        // update(), CollectionService::confirm()'s $ar->update([...]),
        // etc.) — as long as it goes through Eloquent rather than a raw
        // DB::table() query. This is the single point that keeps
        // customers.current_balance in sync, instead of every AR-touching
        // service having to remember to call it themselves.
        static::saved(function (AccountsReceivable $ar) {
            Customer::recalculateBalance($ar->customer_id);

            // If this AR record was reassigned to a different customer,
            // the OLD customer's balance also needs recalculating (their
            // total owed just went down by this invoice's balance).
            if ($ar->wasChanged('customer_id')) {
                Customer::recalculateBalance($ar->getOriginal('customer_id'));
            }
        });

        static::deleted(function (AccountsReceivable $ar) {
            Customer::recalculateBalance($ar->customer_id);
        });

        static::restored(function (AccountsReceivable $ar) {
            Customer::recalculateBalance($ar->customer_id);
        });
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function collector(): BelongsTo
    {
        return $this->belongsTo(Collector::class, 'collector_id');
    }

    public function collections(): HasMany
    {
        return $this->hasMany(Collection::class, 'ar_id');
    }

    public function supportingDocuments(): HasMany
    {
        return $this->hasMany(SupportingDocument::class, 'reference_id')
            ->where('reference_type', 'accounts_receivable');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function deleter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    public function archiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }
}