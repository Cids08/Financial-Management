<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class FixedAsset extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'department_id',
        'asset_code',
        'asset_name',
        'asset_category',
        'serial_number',
        'brand',
        'model',
        'location',
        'purchase_date',
        'purchase_cost',
        'salvage_value',
        'useful_life_years',
        'depreciation_method',
        'annual_depreciation',
        'accumulated_depreciation',
        'book_value',
        'status',
        'remarks',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'purchase_date'            => 'date',
            'purchase_cost'            => 'decimal:2',
            'salvage_value'            => 'decimal:2',
            'useful_life_years'        => 'integer',
            'annual_depreciation'      => 'decimal:2',
            'accumulated_depreciation' => 'decimal:2',
            'book_value'               => 'decimal:2',
        ];
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
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
            $q->where('asset_name', 'ilike', "%{$term}%")
                ->orWhere('asset_code', 'ilike', "%{$term}%")
                ->orWhere('serial_number', 'ilike', "%{$term}%");
        });
    }
}