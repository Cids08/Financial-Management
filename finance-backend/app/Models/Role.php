<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'display_name',
        'description',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permissions')
            ->withTimestamps();
    }

    public function hasPermission(string $permissionName): bool
    {
        // Cheap when ->permissions was eager-loaded (relationLoaded check
        // avoids an extra query per call in a request that already did
        // Role::with('permissions')); falls back to a query otherwise.
        if ($this->relationLoaded('permissions')) {
            return $this->permissions->contains('permission_name', $permissionName);
        }

        return $this->permissions()->where('permission_name', $permissionName)->exists();
    }
}