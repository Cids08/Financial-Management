<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Customer extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'customer_code',
        'customer_name',
        'contact_person',
        'contact_number',
        'email',
        'address',
        'tin',
        'credit_limit',
        'current_balance',
        'status',
        'updated_by',
    ];

    protected $casts = [
        'credit_limit' => 'decimal:2',
        'current_balance' => 'decimal:2',
    ];

    protected static function booted(): void
    {
        static::creating(function (Customer $customer) {
            $customer->customer_code ??= static::nextCode();
        });
    }

    public static function nextCode(): string
    {
        $last = static::withTrashed()->orderByDesc('id')->value('id') ?? 0;

        return 'CUST-' . str_pad((string) ($last + 1), 5, '0', STR_PAD_LEFT);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('customer_name', 'ILIKE', "%{$term}%")
                ->orWhere('email', 'ILIKE', "%{$term}%")
                ->orWhere('contact_person', 'ILIKE', "%{$term}%");
        });
    }
}