<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountsPayable extends Model
{
    use SoftDeletes;

    protected $table = 'accounts_payable';

    protected $fillable = [
        'supplier_id',
        'account_id',
        'invoice_number',
        'invoice_date',
        'due_date',
        'purchase_order_no',
        'billing_address',
        'original_amount',
        'paid_amount',
        'remaining_balance',
        'currency',
        'payment_method',
        'reference_number',
        'status',
        'approved_by',
        'approved_at',
        'has_attachment',
        'remarks',
        'created_by',
        'deleted_by',
    ];

    protected $casts = [
        'invoice_date' => 'date',
        'due_date' => 'date',
        'original_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'remaining_balance' => 'decimal:2',
        'approved_at' => 'datetime',
        'has_attachment' => 'boolean',
    ];

    protected static function booted(): void
    {
        // Mirrors AccountsReceivable's hooks exactly — fires for every
        // create/update on this model regardless of which service
        // triggered it (AccountsPayableService::create/update/approve(),
        // DisbursementService::releaseAp()'s $ap->update([...]), etc.),
        // as long as it's Eloquent rather than a raw DB::table() query.
        // Keeps suppliers.current_balance in sync without any of those
        // services having to remember to call it themselves.
        static::saved(function (AccountsPayable $ap) {
            Supplier::recalculateBalance($ap->supplier_id);

            if ($ap->wasChanged('supplier_id')) {
                Supplier::recalculateBalance($ap->getOriginal('supplier_id'));
            }
        });

        static::deleted(function (AccountsPayable $ap) {
            Supplier::recalculateBalance($ap->supplier_id);
        });

        static::restored(function (AccountsPayable $ap) {
            Supplier::recalculateBalance($ap->supplier_id);
        });
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    // The expense/asset account this bill debits when its accrual journal
    // entry is posted on approval — see AccountsPayableService::approve().
    public function account(): BelongsTo
    {
        return $this->belongsTo(ChartOfAccount::class, 'account_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function deletedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }
}