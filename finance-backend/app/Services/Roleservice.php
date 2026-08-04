<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RoleService
{
    public function list(): Collection
    {
        return Role::query()
            ->withCount('users')
            ->orderBy('display_name')
            ->get();
    }

    /**
     * $data: ['role_name', 'description'].
     *
     * `roles.name` is a unique internal slug the frontend never sees or
     * edits — it's derived from role_name here, with a numeric suffix if
     * the slug collides (e.g. two roles both named "Manager").
     */
    public function create(User $actor, array $data): Role
    {
        return DB::transaction(function () use ($actor, $data) {
            $role = Role::create([
                'name' => $this->generateUniqueSlug($data['role_name']),
                'display_name' => $data['role_name'],
                'description' => $data['description'] ?? null,
                'is_active' => true,
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Roles',
                'action' => 'create',
                'record_id' => $role->id,
                'activity_description' => "Created role {$role->display_name}.",
                'new_values' => $role->only(['name', 'display_name', 'description']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $role->loadCount('users');
        });
    }

    public function update(User $actor, Role $role, array $data): Role
    {
        return DB::transaction(function () use ($actor, $role, $data) {
            $original = $role->only(['display_name', 'description']);

            // `name` (the slug) is intentionally left untouched on edit —
            // renaming a role shouldn't change its stable internal key.
            $role->fill([
                'display_name' => $data['role_name'],
                'description' => $data['description'] ?? null,
            ]);
            $role->save();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Roles',
                'action' => 'update',
                'record_id' => $role->id,
                'activity_description' => "Updated role {$role->display_name}.",
                'old_values' => $original,
                'new_values' => $role->only(['display_name', 'description']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $role->loadCount('users');
        });
    }

    public function delete(User $actor, Role $role): void
    {
        DB::transaction(function () use ($actor, $role) {
            // Soft delete only — users.role_id keeps its FK intact, and
            // Roles.jsx already warns the person when userCount > 0 that
            // those users will need reassigning, not that this cascades.
            $role->delete();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Roles',
                'action' => 'delete',
                'record_id' => $role->id,
                'activity_description' => "Deleted role {$role->display_name}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    public function syncPermissions(User $actor, Role $role, array $permissionIds): Role
    {
        return DB::transaction(function () use ($actor, $role, $permissionIds) {
            $before = $role->permissions()->pluck('permissions.id')->all();
            $role->permissions()->sync($permissionIds);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Roles',
                'action' => 'update_permissions',
                'record_id' => $role->id,
                'activity_description' => "Updated permissions for role {$role->display_name}.",
                'old_values' => ['permission_ids' => $before],
                'new_values' => ['permission_ids' => $permissionIds],
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $role->load('permissions')->loadCount('users');
        });
    }

    protected function generateUniqueSlug(string $displayName): string
    {
        $base = Str::slug($displayName, '_');
        $slug = $base;
        $suffix = 2;

        while (Role::withTrashed()->where('name', $slug)->exists()) {
            $slug = "{$base}_{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}