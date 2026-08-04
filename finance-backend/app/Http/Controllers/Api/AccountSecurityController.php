<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ChangePasswordRequest;
use App\Http\Requests\VerifyTwoFactorRequest;
use App\Http\Resources\ActivityLogResource;
use App\Http\Resources\SessionResource;
use App\Models\ActivityLog;
use App\Services\AccountSecurityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountSecurityController extends Controller
{
    public function __construct(protected AccountSecurityService $security)
    {
    }

    public function updatePassword(ChangePasswordRequest $request): JsonResponse
    {
        $this->security->changePassword(
            $request->user(),
            $request->validated('current'),
            $request->validated('next')
        );

        return response()->json(['success' => true, 'message' => 'Password updated successfully.']);
    }

    public function initiateTwoFactor(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->security->initiateTwoFactor($request->user()),
        ]);
    }

    public function confirmTwoFactor(VerifyTwoFactorRequest $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => 'Two-factor authentication enabled.',
            'data' => $this->security->confirmTwoFactor($request->user(), $request->validated('code')),
        ]);
    }

    public function disableTwoFactor(Request $request): JsonResponse
    {
        $this->security->disableTwoFactor($request->user());

        return response()->json(['success' => true, 'message' => 'Two-factor authentication disabled.']);
    }

    public function sessions(Request $request): JsonResponse
    {
        $currentId = optional($request->user()->currentAccessToken())->id;

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => SessionResource::collection($this->security->listSessions($request->user())),
            'meta' => ['currentTokenId' => $currentId],
        ]);
    }

    public function revokeSession(Request $request, int $tokenId): JsonResponse
    {
        $this->security->revokeSession($request->user(), $tokenId);

        return response()->json(['success' => true, 'message' => 'Session signed out.']);
    }

    public function revokeOtherSessions(Request $request): JsonResponse
    {
        $this->security->revokeOtherSessions($request->user());

        return response()->json(['success' => true, 'message' => 'Signed out of all other sessions.']);
    }

    public function activity(Request $request): JsonResponse
    {
        $logs = ActivityLog::where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => ActivityLogResource::collection($logs),
        ]);
    }

    public function deactivate(Request $request): JsonResponse
    {
        $this->security->deactivate($request->user());

        return response()->json(['success' => true, 'message' => 'Account deactivated.']);
    }
}