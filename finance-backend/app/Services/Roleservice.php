<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class RoleService
{
    /**
     * The internal slug (roles.name) that must always exist, matching the
     * constant of the same name in UserService — that service's
     * last-active-super-admin guard depends on a role with this slug
     * being resolvable at all times.
     */
    protected const SUPER_ADMIN_ROLE = 'super-admin';

    public function list(bool $withArchived = false): Collection
    {
        $query = Role::query()->withCount('users')->orderBy('display_name');

        return $withArchived
            ? $query->onlyTrashed()->get()
            : $query->get();
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

    /**
     * @throws ValidationException
     */
    public function update(User $actor, Role $role, array $data): Role
    {
        $this->guardAgainstUnauthorizedSuperAdminRoleEdit($actor, $role, 'edited');

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

    /**
     * @throws ValidationException
     */
    public function delete(User $actor, Role $role): void
    {
        if ($role->name === self::SUPER_ADMIN_ROLE) {
            throw ValidationException::withMessages([
                'role' => ['The Super Admin role is protected by the system and cannot be deleted.'],
            ]);
        }

        $assignedCount = $role->users()->count();

        if ($assignedCount > 0) {
            throw ValidationException::withMessages([
                'role' => ["This role has {$assignedCount} user(s) assigned. Reassign them to another role before deleting it."],
            ]);
        }

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

    /**
     * Moves every user off $role onto $targetRoleId, then deletes $role.
     * The bulk-reassign alternative to delete()'s hard block when users
     * are still assigned — same protections apply (Super Admin can't be
     * deleted, and only a Super Admin actor may reassign users *into*
     * the Super Admin role in bulk, mirroring UserService's per-user
     * guard against the same privilege-escalation path).
     *
     * @throws ValidationException
     */
    public function reassignAndDelete(User $actor, Role $role, int $targetRoleId): void
    {
        if ($role->name === self::SUPER_ADMIN_ROLE) {
            throw ValidationException::withMessages([
                'role' => ['The Super Admin role is protected by the system and cannot be deleted.'],
            ]);
        }

        if ($targetRoleId === $role->id) {
            throw ValidationException::withMessages([
                'target_role_id' => ['Choose a different role to reassign these users to.'],
            ]);
        }

        $this->guardAgainstUnauthorizedSuperAdminReassignment($actor, $targetRoleId);

        DB::transaction(function () use ($actor, $role, $targetRoleId) {
            $affectedUserIds = $role->users()->pluck('id')->all();
            $affectedCount = count($affectedUserIds);

            if ($affectedCount > 0) {
                $role->users()->update([
                    'role_id' => $targetRoleId,
                    'updated_by' => $actor->id,
                ]);

                AuditLog::create([
                    'user_id' => $actor->id,
                    'module' => 'Roles',
                    'action' => 'bulk_reassign',
                    'record_id' => $role->id,
                    'activity_description' => "Reassigned {$affectedCount} user(s) from role {$role->display_name} to role ID {$targetRoleId} prior to deletion.",
                    'old_values' => ['role_id' => $role->id, 'user_ids' => $affectedUserIds],
                    'new_values' => ['role_id' => $targetRoleId],
                    'ip_address' => request()->ip(),
                    'user_agent' => request()->userAgent(),
                ]);
            }

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

    /**
     * Mirrors UserService::guardAgainstUnauthorizedSuperAdminAssignment —
     * without this, the bulk endpoint would be a much bigger privilege-
     * escalation hole than the per-user one it was built alongside,
     * since it can grant Super Admin to many accounts in one call.
     *
     * @throws ValidationException
     */
    protected function guardAgainstUnauthorizedSuperAdminReassignment(User $actor, int $targetRoleId): void
    {
        $superAdminRoleId = Role::where('name', self::SUPER_ADMIN_ROLE)->value('id');

        if ($superAdminRoleId === null || $targetRoleId !== $superAdminRoleId) {
            return;
        }

        $actorRoleName = Role::where('id', $actor->role_id)->value('name');

        if ($actorRoleName !== self::SUPER_ADMIN_ROLE) {
            throw ValidationException::withMessages([
                'target_role_id' => ['Only a Super Admin can reassign users into the Super Admin role.'],
            ]);
        }
    }

    /**
     * The gap this closes: delete() and reassignAndDelete() already
     * protect the Super Admin role, but update() (rename/description) and
     * syncPermissions() (the "Manage Permissions" modal) had no equivalent
     * check — any Admin could previously rename the Super Admin role or
     * strip/change its permissions entirely, without ever touching delete.
     *
     * @throws ValidationException
     */
    protected function guardAgainstUnauthorizedSuperAdminRoleEdit(User $actor, Role $role, string $verb): void
    {
        if ($role->name !== self::SUPER_ADMIN_ROLE) {
            return;
        }

        $actorRoleName = Role::where('id', $actor->role_id)->value('name');

        if ($actorRoleName !== self::SUPER_ADMIN_ROLE) {
            throw ValidationException::withMessages([
                'role' => ["The Super Admin role is protected by the system and can only be {$verb} by a Super Admin."],
            ]);
        }
    }

    public function restore(User $actor, Role $role): void
    {
        DB::transaction(function () use ($actor, $role) {
            $role->restore();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Roles',
                'action' => 'restore',
                'record_id' => $role->id,
                'activity_description' => "Restored role {$role->display_name}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    /**
     * @throws ValidationException
     */
    public function syncPermissions(User $actor, Role $role, array $permissionIds): Role
    {
        $this->guardAgainstUnauthorizedSuperAdminRoleEdit($actor, $role, 'have its permissions changed');

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
        $base = Str::slug($displayName, '-');
        $slug = $base;
        $suffix = 2;

        while (Role::withTrashed()->where('name', $slug)->exists()) {
            $slug = "{$base}_{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}