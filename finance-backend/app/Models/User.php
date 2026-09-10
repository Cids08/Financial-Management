<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected const SUPER_ADMIN_ROLE = 'super-admin';

    protected $fillable = [
        'employee_no',
        'first_name',
        'middle_name',
        'last_name',
        'suffix',
        'email',
        'phone_number',
        'password',
        'profile_photo',
        'status',
        'role_id',
        'department_id',
        'updated_by',
        'deleted_by',
        'two_factor_secret', 
        'two_factor_recovery_codes', 
        'two_factor_confirmed_at',

    ];

    // failed_login_attempts / locked_until / must_change_password are
    // deliberately NOT in $fillable — they're only ever written via
    // forceFill()/direct ->update() calls inside AuthService/UserService,
    // never from user-supplied request input. Keeping them out of
    // $fillable is a second layer of protection against mass assignment
    // even if a future controller ever did something careless like
    // User::create($request->all()).
    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret', 
        'two_factor_recovery_codes',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login'        => 'datetime',
            'password'          => 'hashed',
            'two_factor_confirmed_at' => 'datetime',
            'locked_until'      => 'datetime',
            'must_change_password' => 'boolean',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function deletedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    /**
     * The collector identity tied to this account, if this user is a
     * Collector. Null for every other role, and possibly null for a
     * Collector-role user whose collectors row hasn't been linked yet.
     */
    public function collector(): HasOne
    {
        return $this->hasOne(Collector::class);
    }

    public function fullName(): string
    {
        return trim("{$this->first_name} {$this->middle_name} {$this->last_name} {$this->suffix}");
    }

    /**
     * Used by CheckPermission middleware (app/Http/Middleware/CheckPermission.php).
     * Reuses the `role()` relation already defined above rather than the
     * HasRoleAndPermissions trait's own role() — that trait's version
     * would collide with this one if `use`d directly.
     *
     * Super Admin bypasses permission checks entirely rather than relying
     * on every permission being seeded AND explicitly assigned to it via
     * role_permissions — without this, Super Admin gets 403'd on any
     * module whose permission row was never seeded/linked, same as any
     * other role. This makes "Super Admin" actually mean "always allowed"
     * instead of "allowed only if someone remembered to grant it."
     */
    public function hasPermission(string $permissionName): bool
    {
        if ($this->hasAnyRole([self::SUPER_ADMIN_ROLE, 'Super Admin', 'admin', 'Admin'])) {
            return true;
        }

        /** @var Role|null $role */
        $role = $this->role()->with('permissions')->first();

        return $role !== null && $role->hasPermission($permissionName);
    }

    public function hasRole(string $roleName): bool
    {
        return $this->role !== null && $this->role->name === $roleName;
    }

    public function hasAnyRole(array $roleNames): bool
    {
        return $this->role !== null && in_array($this->role->name, $roleNames, true);
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