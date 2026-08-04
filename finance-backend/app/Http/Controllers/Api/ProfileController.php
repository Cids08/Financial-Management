<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateAvatarRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Http\Resources\ProfileResource;
use App\Services\ProfileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function __construct(protected ProfileService $profileService)
    {
    }

    /**
     * GET /api/profile
     */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user()->load(['role', 'department']);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => new ProfileResource($user),
        ]);
    }

    /**
     * PUT /api/profile
     */
    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = $this->profileService->update(
            $request->user(),
            $request->validated()
        );

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully.',
            'data'    => new ProfileResource($user),
        ]);
    }

    /**
     * POST /api/profile/avatar
     */
    public function updateAvatar(UpdateAvatarRequest $request): JsonResponse
    {
        $user = $this->profileService->updateAvatar(
            $request->user(),
            $request->file('avatar')
        );

        return response()->json([
            'success' => true,
            'message' => 'Profile photo updated successfully.',
            'data'    => new ProfileResource($user),
        ]);
    }

    /**
     * DELETE /api/profile/avatar
     */
    public function removeAvatar(Request $request): JsonResponse
    {
        $user = $this->profileService->removeAvatar($request->user());

        return response()->json([
            'success' => true,
            'message' => 'Profile photo removed successfully.',
            'data'    => new ProfileResource($user),
        ]);
    }
}