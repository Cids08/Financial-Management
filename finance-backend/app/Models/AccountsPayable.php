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

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
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