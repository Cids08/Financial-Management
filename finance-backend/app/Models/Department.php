<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Department extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'department_code',
        'department_name',
        'department_head',
        'department_email',
        'department_phone',
        'description',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::creating(function (Department $department) {
            $department->department_code ??= static::nextCode();
        });
    }

    public static function nextCode(): string
    {
        $last = static::withTrashed()->orderByDesc('id')->value('id') ?? 0;

        return 'DEPT-' . str_pad((string) ($last + 1), 4, '0', STR_PAD_LEFT);
    }

    /**
     * Employees assigned to this department. Powers the headcount shown
     * on the frontend card — there is no stored headcount column, it's
     * always derived live from users.department_id.
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('department_name', 'ILIKE', "%{$term}%")
                ->orWhere('description', 'ILIKE', "%{$term}%");
        });
    }

    public function stats(): array
    {
        $row = Department::query()
            ->selectRaw('count(*) as total')
            ->selectRaw('count(*) filter (where is_active = true) as active')
            ->selectRaw('count(*) filter (where is_active = false) as inactive')
            ->first();

        return [
            'total' => (int) $row->total,
            'active' => (int) $row->active,
            'inactive' => (int) $row->inactive,
        ];
    }
}