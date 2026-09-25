<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ChartOfAccount extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'account_code',
        'account_name',
        'account_type',
        'account_category',
        'parent_account_id',
        'description',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_account_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_account_id');
    }

    public function journalEntryLines(): HasMany
    {
        return $this->hasMany(JournalEntryLine::class, 'account_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * "1010 — BDO Operating Account" — matches the label format the
     * frontend's chart-of-accounts dropdown already expects.
     */
    public function getDisplayLabelAttribute(): string
    {
        return "{$this->account_code} — {$this->account_name}";
    }

    /**
     * The AR control account — the single receivable row the collection
     * posting and AR journaling post against.
     *
     * Resolved from Setting::ar_control_account_id (a stable account_id)
     * so the account's NAME can be edited freely going forward. Falls back
     * to the legacy name lookup ('Accounts Receivable') and self-heals the
     * setting when the chart still has that row — this is what lets an
     * existing database keep working the moment this code deploys.
     */
    public static function arControlId(): ?int
    {
        $setting = Setting::current();

        if ($setting->ar_control_account_id) {
            $id = (int) $setting->ar_control_account_id;
            if (static::query()->whereKey($id)->exists()) {
                return $id;
            }
        }

        $legacy = static::where('account_name', 'Accounts Receivable')->first();
        if ($legacy) {
            $setting->update(['ar_control_account_id' => (int) $legacy->id]);
            return (int) $legacy->id;
        }

        return null;
    }

    /**
     * Resolves the AR control model — null when the chart has no AR row
     * (callers fall back to, or instead of, the name-based message).
     */
    public static function arControlAccount(): ?self
    {
        $id = static::arControlId();

        return $id ? static::find($id) : null;
    }
}