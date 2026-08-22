<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthService
{
    // How long a pending (password-verified, awaiting emailed code) login stays valid.
    protected const PENDING_LOGIN_TTL_MINUTES = 10;

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

        if (! $user || ! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        if ($user->status !== 'Active') {
            throw ValidationException::withMessages([
                'email' => ['This account is not active. Contact your administrator.'],
            ]);
        }

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

        Mail::raw(
            "Your login verification code is: {$code}\n\n"
                . 'This code expires in ' . self::PENDING_LOGIN_TTL_MINUTES . " minutes.\n"
                . "If this wasn't you, change your password immediately.",
            fn ($message) => $message->to($user->email)->subject('Your login verification code')
        );
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

    protected function maskEmail(string $email): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
        $visible = min(2, strlen($local));

        return substr($local, 0, $visible) . str_repeat('*', max(strlen($local) - $visible, 3)) . '@' . $domain;
    }
}