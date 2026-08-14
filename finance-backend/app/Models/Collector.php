<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Collector extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'employee_no',
        'first_name',
        'middle_name',
        'last_name',
        'phone_number',
        'email',
        'profile_photo',
        'assigned_area',
        'service_area_id',
        'commission_rate',
        'monthly_target',
        'status',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'commission_rate' => 'decimal:2',
            'monthly_target'  => 'decimal:2',
        ];
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function deletedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    public function serviceArea(): BelongsTo
    {
        return $this->belongsTo(ServiceArea::class);
    }

    // Invoices assigned to this collector — this assignment is what
    // CollectionService checks against when recording a collection.
    public function accountsReceivables(): HasMany
    {
        return $this->hasMany(AccountsReceivable::class, 'collector_id');
    }

    public function collections(): HasMany
    {
        return $this->hasMany(Collection::class);
    }

    public function scopeSearch($query, ?string $term)
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function ($q) use ($term) {
            $q->where('employee_no', 'ilike', "%{$term}%")
                ->orWhere('first_name', 'ilike', "%{$term}%")
                ->orWhere('last_name', 'ilike', "%{$term}%")
                ->orWhere('assigned_area', 'ilike', "%{$term}%");
        });
    }
}