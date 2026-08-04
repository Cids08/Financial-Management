<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\AuditLog;
use App\Models\User;
use App\Support\TwoFactor\TotpService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AccountSecurityService
{
    public function __construct(protected TotpService $totp)
    {
    }

    public function changePassword(User $user, string $current, string $new): void
    {
        if (! Hash::check($current, $user->password)) {
            throw ValidationException::withMessages([
                'current' => ['The current password is incorrect.'],
            ]);
        }

        $currentTokenId = optional($user->currentAccessToken())->id;

        $user->update([
            'password' => $new,
            'updated_by' => $user->id,
        ]);

        // Changing the password revokes every other session for safety.
        $user->tokens()->when($currentTokenId, fn ($q) => $q->where('id', '!=', $currentTokenId))->delete();

        $this->log($user, 'Password Change', 'Settings', 'Password was changed.');
    }

    public function initiateTwoFactor(User $user): array
    {
        $secret = $this->totp->generateSecret();

        $user->update([
            'two_factor_secret' => encrypt($secret),
            'two_factor_confirmed_at' => null,
        ]);

        return [
            'secret' => $secret,
            'qrCodeUrl' => $this->totp->getQrCodeUrl($secret, $user->email),
        ];
    }

    public function confirmTwoFactor(User $user, string $code): array
    {
        if (! $user->two_factor_secret) {
            throw ValidationException::withMessages(['code' => ['Start setup again before verifying.']]);
        }

        if (! $this->totp->verify(decrypt($user->two_factor_secret), $code)) {
            throw ValidationException::withMessages(['code' => ['Enter the 6-digit code from your authenticator app.']]);
        }

        $recoveryCodes = collect(range(1, 8))->map(fn () => Str::upper(Str::random(10)));

        $user->update([
            'two_factor_confirmed_at' => now(),
            'two_factor_recovery_codes' => encrypt(
                $recoveryCodes->map(fn ($c) => Hash::make($c))->toJson()
            ),
        ]);

        $this->log($user, '2FA Enabled', 'Settings', 'Two-factor authentication turned on.');

        return ['recoveryCodes' => $recoveryCodes->values()->all()];
    }

    public function disableTwoFactor(User $user): void
    {
        $user->update([
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ]);

        $this->log($user, '2FA Disabled', 'Settings', 'Two-factor authentication turned off.');
    }

    public function listSessions(User $user): Collection
    {
        return $user->tokens()->orderByDesc('last_used_at')->get();
    }

    public function revokeSession(User $user, int $tokenId): void
    {
        /** @var \Laravel\Sanctum\PersonalAccessToken $token */
        $token = $user->tokens()->where('id', $tokenId)->firstOrFail();

        if ($token->id === optional($user->currentAccessToken())->id) {
            throw ValidationException::withMessages([
                'token' => ['You cannot sign out your current session from here.'],
            ]);
        }

        $token->delete();
        $this->log($user, 'Session Revoked', 'Settings', 'Signed out a device.');
    }

    public function revokeOtherSessions(User $user): void
    {
        $currentId = optional($user->currentAccessToken())->id;
        $user->tokens()->when($currentId, fn ($q) => $q->where('id', '!=', $currentId))->delete();
        $this->log($user, 'Signed Out Other Sessions', 'Settings', 'All other sessions were revoked.');
    }

    public function deactivate(User $user): void
    {
        $user->update([
            'status' => 'inactive',
            'updated_by' => $user->id,
        ]);

        $user->tokens()->delete();
        $this->log($user, 'Account Deactivated', 'Settings', 'Account was deactivated by the user.');
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
}