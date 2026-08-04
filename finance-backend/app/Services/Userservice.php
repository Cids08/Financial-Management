<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserService
{
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
     * employee_no and password aren't collected by the current Add User
     * form, so they're generated here. The generated password is NOT
     * emailed/returned by this service as written — wire up a proper
     * invite/reset-password flow (e.g. Password::sendResetLink) before
     * relying on this in production, otherwise new users have no way
     * to actually log in.
     */
    public function create(User $actor, array $data): User
    {
        return DB::transaction(function () use ($actor, $data) {
            $user = User::create([
                'role_id' => $data['role_id'],
                'employee_no' => $this->generateEmployeeNo(),
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'password' => Hash::make(Str::random(32)),
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

    public function update(User $actor, User $user, array $data): User
    {
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

    public function archive(User $actor, User $user): void
    {
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
}