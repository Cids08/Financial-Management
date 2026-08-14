<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $journal_entry_id
 * @property int $account_id
 * @property string $debit
 * @property string $credit
 * @property string|null $reference_type
 * @property int|null $reference_id
 * @property string|null $remarks
 * @property-read JournalEntry $journalEntry
 * @property-read ChartOfAccount $account
 */
class JournalEntryLine extends Model
{
    protected $fillable = [
        'journal_entry_id',
        'account_id',
        'debit',
        'credit',
        'reference_type',
        'reference_id',
        'remarks',
    ];

    protected $casts = [
        'debit' => 'decimal:2',
        'credit' => 'decimal:2',
    ];

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(ChartOfAccount::class, 'account_id');
    }

    /**
     * reference_type stores the human-readable source-module label
     * (e.g. "Collections", "Disbursements") — the same labels the
     * frontend already uses for its REFERENCE_STYLES badge map, so
     * both sides read off one shared vocabulary.
     */
}