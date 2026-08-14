<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Auth;

class Expense extends Model
{
    use HasFactory, SoftDeletes;

    // Business-status constants — adjust if your actual enum values differ.
    public const STATUS_PENDING = 'Pending';
    public const STATUS_APPROVED = 'Approved';
    public const STATUS_REJECTED = 'Rejected';

    public const RECEIPT_PENDING = 'Pending';
    public const RECEIPT_VERIFIED = 'Verified';
    public const RECEIPT_REJECTED = 'Rejected';

    protected $fillable = [
        'budget_id',
        'expense_category_id',
        'supplier_id',
        'expense_date',
        'receipt_number',
        'expense_amount',
        'expense_source',
        'receipt_status',
        'description',
        'is_over_budget',
        'status',
        'created_by',
    ];

    protected $casts = [
        'expense_date' => 'date',
        'expense_amount' => 'decimal:2',
        'is_over_budget' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        // deleted_by isn't touched automatically by SoftDeletes, so we
        // stamp it right before the delete actually happens.
        static::deleting(function (Expense $expense) {
            if (! $expense->isForceDeleting()) {
                $expense->deleted_by = Auth::id();
                $expense->saveQuietly();
            }
        });
    }

    public function budget(): BelongsTo
    {
        return $this->belongsTo(Budget::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class, 'expense_category_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
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
            $q->where('description', 'ilike', "%{$term}%")
                ->orWhere('receipt_number', 'ilike', "%{$term}%")
                ->orWhere('expense_source', 'ilike', "%{$term}%");
        });
    }

    public function scopeStatus(Builder $query, ?string $status): Builder
    {
        return $status ? $query->where('status', $status) : $query;
    }

    public function scopeForBudget(Builder $query, ?int $budgetId): Builder
    {
        return $budgetId ? $query->where('budget_id', $budgetId) : $query;
    }

    public function scopeForCategory(Builder $query, ?int $categoryId): Builder
    {
        return $categoryId ? $query->where('expense_category_id', $categoryId) : $query;
    }
}