<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class TaxObligation extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'tax_type',
        'tax_period',
        'tax_rate',
        'taxable_amount',
        'tax_amount',
        'due_date',
        'payment_date',
        'reference_number',
        'status',
        'remarks',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'tax_rate'       => 'decimal:2',
            'taxable_amount' => 'decimal:2',
            'tax_amount'     => 'decimal:2',
            'due_date'       => 'date',
            'payment_date'   => 'date',
        ];
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function deletedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    public function scopeSearch($query, ?string $term)
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function ($q) use ($term) {
            $q->where('tax_type', 'ilike', "%{$term}%")
                ->orWhere('tax_period', 'ilike', "%{$term}%")
                ->orWhere('reference_number', 'ilike', "%{$term}%");
        });
    }

    /**
     * "Overdue" is never stored — same rule the frontend already follows.
     * Paid records are never reclassified regardless of due_date.
     */
    public function derivedStatus(): string
    {
        if ($this->status === 'Paid') {
            return 'Paid';
        }

        return now()->startOfDay()->gt($this->due_date) ? 'Overdue' : 'Pending';
    }
}