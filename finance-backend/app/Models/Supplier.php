<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'supplier_code',
        'supplier_name',
        'contact_person',
        'contact_number',
        'email',
        'website',
        'address',
        'tin',
        'current_balance',
        'status',
        'updated_by',
    ];

    protected $casts = [
        'current_balance' => 'decimal:2',
    ];

    protected static function booted(): void
    {
        static::creating(function (Supplier $supplier) {
            $supplier->supplier_code ??= static::nextCode();
        });
    }

    public static function nextCode(): string
    {
        $last = static::withTrashed()->orderByDesc('id')->value('id') ?? 0;

        return 'SUPP-' . str_pad((string) ($last + 1), 5, '0', STR_PAD_LEFT);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('supplier_name', 'ILIKE', "%{$term}%")
                ->orWhere('email', 'ILIKE', "%{$term}%")
                ->orWhere('contact_person', 'ILIKE', "%{$term}%");
        });
    }
}