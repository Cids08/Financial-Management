<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthService
{
    /**
     * Verify credentials and issue a fresh Sanctum token.
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

        // One token per "session" — expire long-lived tokens sooner unless
        // "remember" is checked, matching the frontend's Remember Me toggle.
        $expiresAt = $remember ? now()->addDays(30) : now()->addHours(8);

        $token = $user->createToken(
            name: 'auth-token',
            expiresAt: $expiresAt
        )->plainTextToken;

        $user->forceFill(['last_login' => now()])->save();

        return [
            'user'  => $user->load(['role', 'department']),
            'token' => $token,
        ];
    }

    public function logout(User $user): void
    {
        $user->currentAccessToken()?->delete();
    }
}