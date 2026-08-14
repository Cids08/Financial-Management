<?php

namespace App\Traits;

use App\Models\Role;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Add to app/Models/User.php:
 *
 *   use App\Traits\HasRoleAndPermissions;
 *
 *   class User extends Authenticatable
 *   {
 *       use HasRoleAndPermissions;
 *       // ...existing traits/code...
 *   }
 *
 * Requires the existing `role_id` column on `users` (already in your ERD).
 */
trait HasRoleAndPermissions
{
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function hasRole(string $roleName): bool
    {
        return $this->role !== null && $this->role->name === $roleName;
    }

    public function hasAnyRole(array $roleNames): bool
    {
        return $this->role !== null && in_array($this->role->name, $roleNames, true);
    }

    public function hasPermission(string $permissionName): bool
    {
        return $this->role !== null && $this->role->hasPermission($permissionName);
    }

    public function hasAnyPermission(array $permissionNames): bool
    {
        foreach ($permissionNames as $name) {
            if ($this->hasPermission($name)) {
                return true;
            }
        }
        return false;
    }
}