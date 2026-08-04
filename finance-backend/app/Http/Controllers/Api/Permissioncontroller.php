<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PermissionResource;
use App\Models\Permission;
use Illuminate\Http\JsonResponse;

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
}