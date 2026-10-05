<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/**
 * Singleton-style settings row for company branding + regional/financial defaults.
 *
 * There is only ever one row. Always resolve it through Setting::current()
 * rather than querying the table directly, so the "first ever load" case is
 * handled consistently in one place.
 */
class Setting extends Model
{
    protected $table = 'settings';

    /**
     * Request-scoped cache of the single settings row. Settings are read on
     * nearly every request (retention middleware, currency/formats, AR
     * control account) and sometimes per-row inside resources
     * (ChartOfAccount::arControlId), so an uncached current() was costing a
     * `SELECT * FROM settings` per call — N+1 on list endpoints. The saved/
     * deleted model hooks below invalidate it, so a long-lived process
     * (octane/queue/scheduler) still reflects updates.
     */
    protected static ?self $cachedCurrent = null;

    protected $fillable = [
        'company_name',
        'tagline',
        'company_address',
        'company_email',
        'company_phone',
        'company_tin',
        'company_logo',
        'currency',
        'base_currency',
        'exchange_rates',
        'fiscal_year',
        'default_tax_rate',
        'default_penalty_rate',
        'undeposited_funds_account_id', 'collection_closed_through',
        'ar_control_account_id',
        'forecast_months',
        'data_retention_days',
    ];

    protected $casts = [
        'fiscal_year' => 'integer',
        'default_tax_rate' => 'decimal:2',
        'default_penalty_rate' => 'decimal:2',
        'ar_control_account_id' => 'integer',
        'forecast_months' => 'integer',
        'exchange_rates' => 'array',
        'data_retention_days' => 'integer',
    ];

    /**
     * Fetch the single settings row, creating it with safe, NOT-NULL-satisfying
     * defaults the very first time the app runs.
     *
     * Deliberately does NOT key off a hardcoded id (e.g. `id = 1`). Postgres'
     * auto-increment sequence does not reset just because a row was deleted,
     * so a hardcoded-id lookup can permanently stop matching the real row —
     * every call would then silently insert a fresh, empty row instead of
     * returning the existing one. Grabbing the first row regardless of its
     * actual id avoids that failure mode entirely; a new row is only ever
     * created if the table is genuinely empty.
     */
    public static function current(): self
    {
        if (static::$cachedCurrent !== null) {
            return static::$cachedCurrent;
        }

        $existing = static::query()->orderBy('id')->first();
        if ($existing) {
            return static::$cachedCurrent = $existing;
        }

        $payload = [
            'company_name' => config('app.company_name', config('app.name', 'FMS')),
            'tagline' => null,
            'company_address' => null,
            'company_email' => null,
            'company_phone' => null,
            'company_logo' => null,
            'currency' => 'PHP',
            'base_currency' => 'PHP',
            'exchange_rates' => [],
            'fiscal_year' => now()->year,
            'default_tax_rate' => 12,
            'default_penalty_rate' => 0,
            'forecast_months' => 12,
            // Data Privacy Act / BIR retention: books of accounts must be
            // kept for 10 years, so archived records that are never restored
            // are purged permanently only after this many days (3650).
            'data_retention_days' => 3650,
        ];

        // Only fields the current schema actually has. So first-ever-run in a
        // partially-migrated environment (e.g. data_retention_days migration
        // not yet applied) still succeeds instead of throwing SQLSTATE[42703].
        $columns = Schema::getColumnListing('settings');

        return static::$cachedCurrent = static::query()->create(
            array_intersect_key($payload, array_flip($columns))
        );
    }

    protected static function booted(): void
    {
        // Keep the per-process cache honest: any write to the settings row
        // (including the first-ever create above) clears it so a long-lived
        // process still sees the latest values on the next current().
        static::saved(function (): void {
            static::$cachedCurrent = null;
        });

        static::deleted(function (): void {
            static::$cachedCurrent = null;
        });
    }
}