<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PermissionResource;
use App\Models\Permission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PermissionController extends Controller
{
    // Flat list, grouped client-side by `module` — matches how RoleResource
    // ships permissionIds, and keeps this endpoint simple/cacheable.
    public function index(): JsonResponse
    {
        $permissions = Permission::query()
            ->where('is_active', true)
            ->orderBy('module')
            ->orderBy('display_name')
            ->get();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => PermissionResource::collection($permissions),
        ]);
    }

    /**
     * Returns the AUTHENTICATED user's own permission_name strings as a
     * flat array of plain strings — e.g. ["users.view", "ap.manage"].
     *
     * Distinct from index(): that endpoint lists every permission in the
     * system (for Roles.jsx's checkbox UI); this one is scoped to whoever
     * is logged in, and is what the sidebar/route guards actually check
     * against. Deliberately NOT gated by any 'permission:' middleware —
     * every logged-in user needs to know their own permissions just to
     * render their own sidebar, regardless of what those permissions are.
     */
    public function mine(Request $request): JsonResponse
    {
        $user = $request->user();

        $permissionNames = $user->role
            ? $user->role->permissions()->where('permissions.is_active', true)->pluck('permission_name')
            : collect();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $permissionNames->values(),
        ]);
    }
}