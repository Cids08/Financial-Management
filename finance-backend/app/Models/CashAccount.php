<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class CashAccount extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'account_code',
        'account_name',
        'bank_name',
        'branch_name',
        'account_number',
        'swift_code',
        'account_type',
        'currency',
        'opening_balance',
        'current_balance',
        'is_default',
        'status',
        // Links this cash account to its own chart_of_accounts row —
        // DisbursementService::releaseAp()/releasePayroll() read this
        // directly to know which GL account to credit when cash goes
        // out. Replaces the old config('accounting.accounts.
        // cash_account_map') array, which had to be hand-edited every
        // time a cash account was added.
        'chart_of_account_id',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'opening_balance' => 'decimal:2',
            'current_balance' => 'decimal:2',
            'is_default'      => 'boolean',
        ];
    }

    public function chartOfAccount(): BelongsTo
    {
        return $this->belongsTo(ChartOfAccount::class, 'chart_of_account_id');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
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
            $q->where('account_name', 'ilike', "%{$term}%")
                ->orWhere('bank_name', 'ilike', "%{$term}%")
                ->orWhere('account_number', 'ilike', "%{$term}%");
        });
    }
}