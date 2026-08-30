<?php

namespace App\Services;

use App\Events\ForcedLogout;
use App\Exceptions\AccountLockedException;
use App\Mail\LoginNotificationMail;
use App\Mail\TwoFactorCodeMail;
use App\Models\ActivityLog;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\GeoIpService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthService
{
    public function __construct(protected GeoIpService $geoIp)
    {
    }

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

    // Only warn on the last 2 attempts before lockout, not from attempt 1.
    // Early silence means a bad actor probing the login form for the
    // first time gets no signal a threshold even exists; the warning
    // exists for the legitimate case of "I keep mistyping my password,"
    // where a late heads-up is still genuinely useful before it's too late.
    protected const WARN_WHEN_REMAINING_ATTEMPTS = 2;

    /**
     * Verify credentials. If the account has 2FA enabled, this does NOT
     * issue a token — it emails a code and returns a pending-login ticket
     * instead. The frontend then calls verifyLoginTwoFactor() with that
     * ticket + the code to actually get a token.
     *
     * @param string|null $clientSessionId Random ID the frontend generates
     *        once per browser tab. Threaded through to issueToken() so the
     *        device that's currently logging in can be excluded from its
     *        own ForcedLogout broadcast — see ForcedLogout's docblock.
     *
     * @throws ValidationException
     */
    public function login(string $email, string $password, bool $remember = false, ?string $clientSessionId = null): array
    {
        $user = User::where('email', $email)->first();

        if ($user && $this->isLocked($user)) {
            throw new AccountLockedException(now()->diffInSeconds($user->locked_until));
        }

        if (! $user || ! Hash::check($password, $user->password)) {
            if ($user) {
                $this->registerFailedAttempt($user);

                // The attempt that just ran may have been the one that
                // tripped the lock (registerFailedAttempt sets locked_until
                // on $user in-place). Report that immediately rather than
                // showing a generic "wrong password" and making them
                // discover the lockout only on their NEXT try.
                if ($this->isLocked($user)) {
                    throw new AccountLockedException(now()->diffInSeconds($user->locked_until));
                }

                $remaining = self::MAX_FAILED_ATTEMPTS - $user->failed_login_attempts;

                if ($remaining <= self::WARN_WHEN_REMAINING_ATTEMPTS) {
                    throw ValidationException::withMessages([
                        'email' => [sprintf(
                            'These credentials do not match our records. %d attempt%s remaining before this account is temporarily locked.',
                            $remaining,
                            $remaining === 1 ? '' : 's'
                        )],
                    ]);
                }
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
            return $this->issuePendingLogin($user, $remember, $clientSessionId);
        }

        $user->forceFill(['last_login' => now()])->save();

        return [
            'requiresTwoFactor' => false,
            'user'  => $user->load(['role', 'department']),
            'token' => $this->issueToken($user, $remember, $clientSessionId),
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
            'token' => $this->issueToken($user, $pending['remember'], $pending['client_session_id'] ?? null),
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

    protected function issuePendingLogin(User $user, bool $remember, ?string $clientSessionId): array
    {
        $pendingToken = Str::random(40);

        Cache::put(
            $this->pendingCacheKey($pendingToken),
            ['user_id' => $user->id, 'remember' => $remember, 'client_session_id' => $clientSessionId],
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
    //
    // Single active session policy: every successful login revokes every
    // OTHER token belonging to this user and broadcasts a ForcedLogout
    // notice, so any other open device/tab signs itself out immediately
    // instead of waiting for its next API call to fail with a 401.
    protected function issueToken(User $user, bool $remember, ?string $clientSessionId = null): string
    {
        $expiresAt = $remember ? now()->addDays(30) : now()->addHours(8);
        $ip = request()->ip();
        $deviceLabel = $this->deviceLabel(request()->userAgent());
        $location = $this->geoIp->locate($ip);

        $newToken = $user->createToken(
            name: $deviceLabel,
            expiresAt: $expiresAt
        );

        $newToken->accessToken->forceFill([
            'ip_address' => $ip,
            'user_agent' => request()->userAgent(),
            'location'   => $location,
        ])->save();

        $user->tokens()->where('id', '!=', $newToken->accessToken->id)->delete();

        broadcast(new ForcedLogout($user->id, $clientSessionId, $deviceLabel));

        // Secondary channel alongside the real-time WebSocket notice above
        // — this reaches the person even if their other device/tab isn't
        // currently open in a browser to receive the broadcast.
        Mail::to($user->email)->send(new LoginNotificationMail(
            $deviceLabel,
            $ip,
            $location,
            now()->format('F j, Y \a\t g:i A')
        ));

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