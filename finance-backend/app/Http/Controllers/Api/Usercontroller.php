<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function __construct(protected UserService $userService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        // ?archived=1 mirrors the "Show archived" toggle in Users.jsx —
        // it swaps to the trashed set rather than unioning both.
        $archived = $request->boolean('archived');

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => UserResource::collection($this->userService->list($archived)),
        ]);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = $this->userService->create($request->user(), $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'User created successfully.',
            'data' => new UserResource($user),
        ], 201);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $user = $this->userService->update($request->user(), $user, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'User updated successfully.',
            'data' => new UserResource($user),
        ]);
    }

    public function archive(Request $request, User $user): JsonResponse
    {
        $this->userService->archive($request->user(), $user);

        return response()->json([
            'success' => true,
            'message' => 'User archived successfully.',
        ]);
    }

    // Route-model binding needs withTrashed() here since the user is
    // soft-deleted; see the routes file note below.
    public function restore(Request $request, User $user): JsonResponse
    {
        $this->userService->restore($request->user(), $user);

        return response()->json([
            'success' => true,
            'message' => 'User restored successfully.',
        ]);
    }
}