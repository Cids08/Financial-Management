<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRoleRequest;
use App\Http\Requests\UpdateRoleRequest;
use App\Http\Requests\UpdateRolePermissionsRequest;
use App\Http\Requests\ReassignAndDeleteRoleRequest;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use App\Services\RoleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class RoleController extends Controller
{
    public function __construct(protected RoleService $roleService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        // ?archived=1 mirrors Users.jsx's "Show archived" toggle.
        $archived = $request->boolean('archived');

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => RoleResource::collection($this->roleService->list($archived)),
        ]);
    }

    public function store(StoreRoleRequest $request): JsonResponse
    {
        $role = $this->roleService->create($request->user(), $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Role created successfully.',
            'data' => new RoleResource($role),
        ], 201);
    }

    public function update(UpdateRoleRequest $request, Role $role): JsonResponse
    {
        try {
            $role = $this->roleService->update($request->user(), $role, $request->validated());
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
                'data'    => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Role updated successfully.',
            'data' => new RoleResource($role),
        ]);
    }

    public function destroy(Request $request, Role $role): JsonResponse
    {
        try {
            $this->roleService->delete($request->user(), $role);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
                'data'    => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Role deleted successfully.',
        ]);
    }

    // POST /roles/{role}/reassign-and-delete — the alternative to destroy()
    // when the role still has users assigned: moves them onto
    // target_role_id first, then deletes the role, as one transaction.
    public function reassignAndDelete(ReassignAndDeleteRoleRequest $request, Role $role): JsonResponse
    {
        try {
            $this->roleService->reassignAndDelete(
                $request->user(),
                $role,
                (int) $request->validated('target_role_id')
            );
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
                'data'    => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Users reassigned and role deleted successfully.',
        ]);
    }

    // Route-model binding needs withTrashed() here since the role is
    // soft-deleted; see the routes file note.
    public function restore(Request $request, Role $role): JsonResponse
    {
        $this->roleService->restore($request->user(), $role);

        return response()->json([
            'success' => true,
            'message' => 'Role restored successfully.',
        ]);
    }

    // GET /roles/{role} — used when opening the "Manage Permissions" modal,
    // since the list endpoint deliberately omits permissionIds (see
    // RoleResource) to avoid loading that relation for every row.
    public function show(Role $role): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => new RoleResource($role->load('permissions')->loadCount('users')),
        ]);
    }

    public function updatePermissions(UpdateRolePermissionsRequest $request, Role $role): JsonResponse
    {
        try {
            $role = $this->roleService->syncPermissions(
                $request->user(),
                $role,
                $request->validated('permission_ids')
            );
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
                'data'    => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Role permissions updated successfully.',
            'data' => new RoleResource($role),
        ]);
    }
}