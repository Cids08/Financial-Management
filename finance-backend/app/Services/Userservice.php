<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class UserService
{
    protected const SUPER_ADMIN_ROLE = 'super-admin';

    /**
     * @param bool $withArchived When true, returns only soft-deleted users
     *                           (matches Users.jsx's "Show archived" toggle,
     *                           which is either/or, not a union of both).
     */
    public function list(bool $withArchived = false): Collection
    {
        $query = User::query()->with('role');

        return $withArchived
            ? $query->onlyTrashed()->get()
            : $query->get();
    }

    /**
     * $data: ['first_name', 'last_name', 'email', 'role_id', 'status'].
     *
     * Password is a default derived from the generated employee_no
     * (e.g. "Alibaton@EMP-00042") rather than a random unusable one —
     * the admin creating the account can read the pattern off the
     * employee_no shown in the UI and share it with the new user. They're
     * expected to change it via Settings > Change Password after first
     * login. This is intentionally simple rather than email-based
     * (Password::sendResetLink) for now — see chat history if reviving
     * the email-reset flow later; ResetPasswordRequest.php and
     * ResetPassword.jsx are already built and just unused.
     */
    public function create(User $actor, array $data): User
    {
        $this->guardAgainstUnauthorizedSuperAdminAssignment($actor, $data);

        return DB::transaction(function () use ($actor, $data) {
            $employeeNo = $this->generateEmployeeNo();

            $user = User::create([
                'role_id' => $data['role_id'],
                'employee_no' => $employeeNo,
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'password' => Hash::make("Alibaton@{$employeeNo}"),
                'status' => $data['status'],
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Users',
                'action' => 'create',
                'record_id' => $user->id,
                'activity_description' => "Created user {$user->first_name} {$user->last_name}.",
                'new_values' => $user->only(['role_id', 'first_name', 'last_name', 'email', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $user->load('role');
        });
    }

    /**
     * @throws ValidationException
     */
    public function update(User $actor, User $user, array $data): User
    {
        $this->guardAgainstUnauthorizedSuperAdminAssignment($actor, $data);
        $this->guardAgainstSelfLockout($actor, $user, $data);
        $this->guardAgainstStrandingSuperAdmins($user, $data);

        return DB::transaction(function () use ($actor, $user, $data) {
            $original = $user->only(['role_id', 'first_name', 'last_name', 'email', 'status']);

            $user->fill([
                'role_id' => $data['role_id'],
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'status' => $data['status'],
            ]);
            $user->save();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Users',
                'action' => 'update',
                'record_id' => $user->id,
                'activity_description' => "Updated user {$user->first_name} {$user->last_name}.",
                'old_values' => $original,
                'new_values' => $user->only(['role_id', 'first_name', 'last_name', 'email', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $user->load('role');
        });
    }

    /**
     * @throws ValidationException
     */
    public function archive(User $actor, User $user): void
    {
        if ($user->id === $actor->id) {
            throw ValidationException::withMessages([
                'user' => ['You cannot archive your own account.'],
            ]);
        }

        if ($this->isLastActiveSuperAdmin($user)) {
            throw ValidationException::withMessages([
                'user' => ['This is the last active Super Admin account and cannot be archived. Promote another user to Super Admin first.'],
            ]);
        }

        DB::transaction(function () use ($actor, $user) {
            $user->update(['deleted_by' => $actor->id, 'status' => 'Inactive']);
            $user->delete(); // soft delete — sets deleted_at

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Users',
                'action' => 'archive',
                'record_id' => $user->id,
                'activity_description' => "Archived user {$user->first_name} {$user->last_name}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    public function restore(User $actor, User $user): void
    {
        DB::transaction(function () use ($actor, $user) {
            $user->restore();
            $user->update(['deleted_by' => null]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Users',
                'action' => 'restore',
                'record_id' => $user->id,
                'activity_description' => "Restored user {$user->first_name} {$user->last_name}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    protected function generateEmployeeNo(): string
    {
        // withTrashed so archived users' numbers aren't reused.
        $next = User::withTrashed()->max('id') + 1;

        return 'EMP-' . str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }

    /**
     * Blocks a user from deactivating or re-assigning away their own role
     * through this endpoint. Editing your own name/email is still fine —
     * only the fields that could lock you out are restricted.
     *
     * @throws ValidationException
     */
    protected function guardAgainstSelfLockout(User $actor, User $target, array $data): void
    {
        if ($target->id !== $actor->id) {
            return;
        }

        if (($data['status'] ?? $target->status) !== 'Active') {
            throw ValidationException::withMessages([
                'status' => ['You cannot deactivate your own account.'],
            ]);
        }

        if (isset($data['role_id']) && (int) $data['role_id'] !== (int) $target->role_id) {
            throw ValidationException::withMessages([
                'role_id' => ['You cannot change your own role.'],
            ]);
        }
    }

    /**
     * Blocks demoting or deactivating the last active Super Admin via a
     * normal update (e.g. changing their role or flipping status to
     * Inactive) — the same failure mode as archiving them, just via a
     * different endpoint.
     *
     * @throws ValidationException
     */
    protected function guardAgainstStrandingSuperAdmins(User $target, array $data): void
    {
        if (! $this->isLastActiveSuperAdmin($target)) {
            return;
        }

        $losingRole = isset($data['role_id']) && (int) $data['role_id'] !== (int) $target->role_id;
        $losingStatus = ($data['status'] ?? $target->status) !== 'Active';

        if ($losingRole || $losingStatus) {
            throw ValidationException::withMessages([
                'role_id' => ["This is the last active Super Admin. Promote another user to Super Admin before changing this account's role or status."],
            ]);
        }
    }

    /**
     * Only an actor who is themselves an active Super Admin may assign the
     * Super Admin role to a user (via create or update) — otherwise any
     * authenticated user hitting this endpoint could grant themselves or
     * anyone else full access, since role_id is otherwise just a plain
     * field with no authorization tied to its value.
     *
     * @throws ValidationException
     */
    protected function guardAgainstUnauthorizedSuperAdminAssignment(User $actor, array $data): void
    {
        if (! isset($data['role_id'])) {
            return;
        }

        $superAdminRoleId = Role::where('name', self::SUPER_ADMIN_ROLE)->value('id');

        if ($superAdminRoleId === null || (int) $data['role_id'] !== $superAdminRoleId) {
            return;
        }

        $actorRoleName = Role::where('id', $actor->role_id)->value('name');

        if ($actorRoleName !== self::SUPER_ADMIN_ROLE) {
            throw ValidationException::withMessages([
                'role_id' => ['Only a Super Admin can assign the Super Admin role.'],
            ]);
        }
    }

    protected function isLastActiveSuperAdmin(User $user): bool
    {
        if ($user->status !== 'Active' || $user->trashed()) {
            return false;
        }

        $superAdminRoleId = Role::where('name', self::SUPER_ADMIN_ROLE)->value('id');

        if ($superAdminRoleId === null || $user->role_id !== $superAdminRoleId) {
            return false;
        }

        $activeSuperAdminCount = User::where('role_id', $superAdminRoleId)
            ->where('status', 'Active')
            ->count();

        return $activeSuperAdminCount <= 1;
    }
}