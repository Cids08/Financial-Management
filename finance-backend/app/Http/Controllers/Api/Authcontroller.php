<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\LoginResendTwoFactorRequest;
use App\Http\Requests\LoginVerifyTwoFactorRequest;
use App\Http\Resources\ProfileResource;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(protected AuthService $authService)
    {
    }

    /**
     * POST /api/login
     */
    public function login(LoginRequest $request): JsonResponse
    {
        try {
            $result = $this->authService->login(
                $request->string('email'),
                $request->string('password'),
                $request->boolean('remember'),
                $request->string('client_session_id')->toString() ?: null
            );
        } catch (\App\Exceptions\AccountLockedException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Too many failed attempts. Your account is temporarily locked.',
                'data' => ['locked' => true, 'retryAfter' => $e->secondsRemaining],
            ], 423);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
                'data'    => null,
            ], 422);
        }

        if ($result['requiresTwoFactor']) {
            return response()->json([
                'success' => true,
                'message' => 'Enter the verification code sent to your email.',
                'data'    => [
                    'requiresTwoFactor' => true,
                    'pendingToken' => $result['pendingToken'],
                    'maskedEmail' => $result['maskedEmail'],
                ],
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Logged in successfully.',
            'data'    => [
                'requiresTwoFactor' => false,
                'token' => $result['token'],
                'user'  => new ProfileResource($result['user']),
            ],
        ]);
    }

    /**
     * POST /api/login/verify-two-factor
     */
    public function verifyTwoFactor(LoginVerifyTwoFactorRequest $request): JsonResponse
    {
        try {
            $result = $this->authService->verifyLoginTwoFactor(
                $request->string('pendingToken'),
                $request->string('code')
            );
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
                'data'    => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Logged in successfully.',
            'data'    => [
                'token' => $result['token'],
                'user'  => new ProfileResource($result['user']),
            ],
        ]);
    }

    /**
     * POST /api/login/resend-two-factor
     */
    public function resendTwoFactor(LoginResendTwoFactorRequest $request): JsonResponse
    {
        try {
            $result = $this->authService->resendLoginTwoFactor($request->string('pendingToken'));
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
                'data'    => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'A new code has been sent.',
            'data'    => ['maskedEmail' => $result['maskedEmail']],
        ]);
    }

    /**
     * POST /api/logout
     */
    public function logout(Request $request): JsonResponse
    {
        $this->authService->logout($request->user());

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully.',
            'data'    => null,
        ]);
    }
}