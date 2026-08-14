<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $transaction_no
 * @property Carbon $transaction_date
 * @property string $description
 * @property string $status
 * @property int|null $posted_by
 * @property Carbon|null $posted_at
 * @property int $created_by
 * @property \Illuminate\Database\Eloquent\Collection<int, JournalEntryLine> $lines
 * @property-read bool $is_balanced
 */
class JournalEntry extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'transaction_no',
        'transaction_date',
        'description',
        'status',
        'posted_by',
        'posted_at',
        'created_by',
    ];

    protected $casts = [
        'transaction_date' => 'date',
        'posted_at' => 'datetime',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(JournalEntryLine::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    public function deleter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    public function scopePosted($query)
    {
        return $query->where('status', 'Posted');
    }

    /** Sum of this entry's lines; should always be 0 once posted. */
    public function getIsBalancedAttribute(): bool
    {
        return abs(
            $this->lines->sum('debit') - $this->lines->sum('credit')
        ) < 0.005;
    }
}