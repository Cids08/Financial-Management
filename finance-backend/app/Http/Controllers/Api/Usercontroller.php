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
use Illuminate\Validation\ValidationException;

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
        try {
            $user = $this->userService->create($request->user(), $request->validated());
        } catch (ValidationException $e) {
            return $this->guardFailureResponse($e);
        }

        return response()->json([
            'success' => true,
            'message' => 'User created successfully.',
            'data' => new UserResource($user),
        ], 201);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        try {
            $user = $this->userService->update($request->user(), $user, $request->validated());
        } catch (ValidationException $e) {
            return $this->guardFailureResponse($e);
        }

        return response()->json([
            'success' => true,
            'message' => 'User updated successfully.',
            'data' => new UserResource($user),
        ]);
    }

    public function archive(Request $request, User $user): JsonResponse
    {
        try {
            $this->userService->archive($request->user(), $user);
        } catch (ValidationException $e) {
            return $this->guardFailureResponse($e);
        }

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

    /**
     * Account-safety guard failures (last-super-admin, self-lockout) are
     * business-rule violations, not malformed input — still surfaced as
     * 422 with the standard {success,message,data} shape so the frontend's
     * existing formError handling in useUsers/Users.jsx picks them up
     * without any special-casing.
     */
    protected function guardFailureResponse(ValidationException $e): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => collect($e->errors())->flatten()->first(),
            'data'    => null,
        ], 422);
    }
}