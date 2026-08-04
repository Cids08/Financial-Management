<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

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

    protected $fillable = [
        'company_name',
        'tagline',
        'company_address',
        'company_email',
        'company_phone',
        'company_logo',
        'currency',
        'fiscal_year',
        'default_tax_rate',
        'forecast_months',
    ];

    protected $casts = [
        'fiscal_year' => 'integer',
        'default_tax_rate' => 'decimal:2',
        'forecast_months' => 'integer',
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
        return static::query()->orderBy('id')->first() ?? static::query()->create([
            'company_name' => config('app.name', 'FMS'),
            'tagline' => null,
            'company_address' => null,
            'company_email' => null,
            'company_phone' => null,
            'company_logo' => null,
            'currency' => 'PHP',
            'fiscal_year' => now()->year,
            'default_tax_rate' => 12,
            'forecast_months' => 12,
        ]);
    }
}