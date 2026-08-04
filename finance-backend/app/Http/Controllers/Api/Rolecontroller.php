<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRoleRequest;
use App\Http\Requests\UpdateRoleRequest;
use App\Http\Requests\UpdateRolePermissionsRequest;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use App\Services\RoleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function __construct(protected RoleService $roleService)
    {
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => RoleResource::collection($this->roleService->list()),
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
        $role = $this->roleService->update($request->user(), $role, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Role updated successfully.',
            'data' => new RoleResource($role),
        ]);
    }

    public function destroy(Request $request, Role $role): JsonResponse
    {
        $this->roleService->delete($request->user(), $role);

        return response()->json([
            'success' => true,
            'message' => 'Role deleted successfully.',
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
        $role = $this->roleService->syncPermissions(
            $request->user(),
            $role,
            $request->validated('permission_ids')
        );

        return response()->json([
            'success' => true,
            'message' => 'Role permissions updated successfully.',
            'data' => new RoleResource($role),
        ]);
    }
}