<?php

namespace App\Services;

use App\Mail\TwoFactorCodeMail;
use App\Models\ActivityLog;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthService
{
    // How long a pending (password-verified, awaiting emailed code) login
    // stays valid. Public so TwoFactorCodeMail can read it without
    // duplicating the number in the email template.
    public const PENDING_LOGIN_TTL_MINUTES = 3;

    // Account-level lockout, separate from the per-IP throttle:5,1 on the
    // route. The IP throttle stops rapid-fire attempts from one address;
    // this stops someone from grinding a single account's password across
    // many IPs/botnet nodes, which the IP limit alone can't catch.
    protected const MAX_FAILED_ATTEMPTS = 5;
    protected const LOCKOUT_MINUTES = 15;

    /**
     * Verify credentials. If the account has 2FA enabled, this does NOT
     * issue a token — it emails a code and returns a pending-login ticket
     * instead. The frontend then calls verifyLoginTwoFactor() with that
     * ticket + the code to actually get a token.
     *
     * @throws ValidationException
     */
    public function login(string $email, string $password, bool $remember = false): array
    {
        $user = User::where('email', $email)->first();

        if ($user && $this->isLocked($user)) {
            throw ValidationException::withMessages([
                'email' => ['Too many failed attempts. Try again in a few minutes.'],
            ]);
        }

        if (! $user || ! Hash::check($password, $user->password)) {
            if ($user) {
                $this->registerFailedAttempt($user);
            }

            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        if ($user->status !== 'Active') {
            throw ValidationException::withMessages([
                'email' => ['This account is not active. Contact your administrator.'],
            ]);
        }

        $this->clearFailedAttempts($user);

        if ($user->two_factor_confirmed_at) {
            return $this->issuePendingLogin($user, $remember);
        }

        $user->forceFill(['last_login' => now()])->save();

        return [
            'requiresTwoFactor' => false,
            'user'  => $user->load(['role', 'department']),
            'token' => $this->issueToken($user, $remember),
        ];
    }

    /**
     * Step 2 of a 2FA login: exchange a pending ticket + emailed code for a
     * real token. The ticket is what proves the password was already
     * verified — it's only ever handed out after a successful password
     * check, so knowing/guessing a code alone (without the ticket) can't be
     * used to sign in.
     *
     * @throws ValidationException
     */
    public function verifyLoginTwoFactor(string $pendingToken, string $code): array
    {
        $pending = Cache::get($this->pendingCacheKey($pendingToken));

        if (! $pending) {
            throw ValidationException::withMessages([
                'code' => ['This login has expired. Please sign in again.'],
            ]);
        }

        $hashed = Cache::get($this->codeCacheKey($pendingToken));

        if (! $hashed || ! Hash::check($code, $hashed)) {
            throw ValidationException::withMessages([
                'code' => ['That code is incorrect or has expired.'],
            ]);
        }

        $user = User::findOrFail($pending['user_id']);

        Cache::forget($this->pendingCacheKey($pendingToken));
        Cache::forget($this->codeCacheKey($pendingToken));

        $user->forceFill(['last_login' => now()])->save();

        return [
            'user'  => $user->load(['role', 'department']),
            'token' => $this->issueToken($user, $pending['remember']),
        ];
    }

    /**
     * Resend the login verification code for a still-valid pending login.
     *
     * @throws ValidationException
     */
    public function resendLoginTwoFactor(string $pendingToken): array
    {
        $pending = Cache::get($this->pendingCacheKey($pendingToken));

        if (! $pending) {
            throw ValidationException::withMessages([
                'code' => ['This login has expired. Please sign in again.'],
            ]);
        }

        $user = User::findOrFail($pending['user_id']);

        // Refresh the ticket's TTL alongside the new code so a resend near
        // the end of the window doesn't leave the user stuck.
        Cache::put($this->pendingCacheKey($pendingToken), $pending, now()->addMinutes(self::PENDING_LOGIN_TTL_MINUTES));

        $this->sendLoginCode($user, $pendingToken);

        return ['maskedEmail' => $this->maskEmail($user->email)];
    }

    public function logout(User $user): void
    {
        $user->currentAccessToken()?->delete();
    }

    protected function issuePendingLogin(User $user, bool $remember): array
    {
        $pendingToken = Str::random(40);

        Cache::put(
            $this->pendingCacheKey($pendingToken),
            ['user_id' => $user->id, 'remember' => $remember],
            now()->addMinutes(self::PENDING_LOGIN_TTL_MINUTES)
        );

        $this->sendLoginCode($user, $pendingToken);

        return [
            'requiresTwoFactor' => true,
            'pendingToken' => $pendingToken,
            'maskedEmail' => $this->maskEmail($user->email),
        ];
    }

    protected function sendLoginCode(User $user, string $pendingToken): void
    {
        $code = (string) random_int(100000, 999999);

        Cache::put(
            $this->codeCacheKey($pendingToken),
            Hash::make($code),
            now()->addMinutes(self::PENDING_LOGIN_TTL_MINUTES)
        );

        Mail::to($user->email)->send(new TwoFactorCodeMail($code, self::PENDING_LOGIN_TTL_MINUTES));
    }

    // Captures a friendly device label + IP/location on the token row
    // itself, so Active Sessions can show something better than
    // "auth-token" / Unknown location / Unknown IP.
    protected function issueToken(User $user, bool $remember): string
    {
        $expiresAt = $remember ? now()->addDays(30) : now()->addHours(8);
        $ip = request()->ip();

        $newToken = $user->createToken(
            name: $this->deviceLabel(request()->userAgent()),
            expiresAt: $expiresAt
        );

        $newToken->accessToken->forceFill([
            'ip_address' => $ip,
            'user_agent' => request()->userAgent(),
            'location'   => $this->resolveLocation($ip),
        ])->save();

        return $newToken->plainTextToken;
    }

    protected function deviceLabel(?string $userAgent): string
    {
        if (! $userAgent) {
            return 'Unknown device';
        }

        $platform = match (true) {
            (bool) preg_match('/iPhone/i', $userAgent) => 'iPhone',
            (bool) preg_match('/iPad/i', $userAgent) => 'iPad',
            (bool) preg_match('/Android/i', $userAgent) => 'Android',
            (bool) preg_match('/Macintosh/i', $userAgent) => 'Mac',
            (bool) preg_match('/Windows/i', $userAgent) => 'Windows',
            (bool) preg_match('/Linux/i', $userAgent) => 'Linux',
            default => 'Unknown device',
        };

        $browser = match (true) {
            (bool) preg_match('/Edg\//i', $userAgent) => 'Edge',
            (bool) preg_match('/Chrome\//i', $userAgent) => 'Chrome',
            (bool) preg_match('/Firefox\//i', $userAgent) => 'Firefox',
            (bool) preg_match('/Safari\//i', $userAgent) && ! preg_match('/Chrome\//i', $userAgent) => 'Safari',
            default => null,
        };

        return $browser ? "{$browser} on {$platform}" : $platform;
    }

    // No geolocation provider is wired up yet (MaxMind, ipapi.co, etc. all
    // need an account/API key or a downloaded database). Returns null
    // until one is configured — SessionResource + the frontend already
    // treat a null location as "Unknown location", so nothing breaks.
    // Tell me which provider you want and I'll fill this in for real.
    protected function resolveLocation(?string $ip): ?string
    {
        return null;
    }

    protected function pendingCacheKey(string $pendingToken): string
    {
        return "login-pending:{$pendingToken}";
    }

    protected function codeCacheKey(string $pendingToken): string
    {
        return "login-2fa:{$pendingToken}";
    }

    protected function isLocked(User $user): bool
    {
        return $user->locked_until && $user->locked_until->isFuture();
    }

    protected function registerFailedAttempt(User $user): void
    {
        $attempts = $user->failed_login_attempts + 1;

        $update = ['failed_login_attempts' => $attempts];

        if ($attempts >= self::MAX_FAILED_ATTEMPTS) {
            $update['locked_until'] = now()->addMinutes(self::LOCKOUT_MINUTES);
            $update['failed_login_attempts'] = 0; // reset counter, lock takes over

            $this->log($user, 'Account Locked', 'Authentication', sprintf(
                'Account locked for %d minutes after %d failed login attempts.',
                self::LOCKOUT_MINUTES,
                self::MAX_FAILED_ATTEMPTS
            ));
        }

        $user->forceFill($update)->save();
    }

    protected function clearFailedAttempts(User $user): void
    {
        if ($user->failed_login_attempts > 0 || $user->locked_until) {
            $user->forceFill([
                'failed_login_attempts' => 0,
                'locked_until' => null,
            ])->save();
        }
    }

    protected function log(User $user, string $activity, string $module, string $description): void
    {
        ActivityLog::record($user->id, $activity, $module, request()->ip());

        AuditLog::create([
            'user_id' => $user->id,
            'module' => $module,
            'action' => Str::snake($activity),
            'record_id' => $user->id,
            'activity_description' => $description,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);
    }

    protected function maskEmail(string $email): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
        $visible = min(2, strlen($local));

        return substr($local, 0, $visible) . str_repeat('*', max(strlen($local) - $visible, 3)) . '@' . $domain;
    }
}