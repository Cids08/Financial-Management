<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Register in bootstrap/app.php:
 *
 *   ->withMiddleware(function (Middleware $middleware) {
 *       $middleware->alias(['permission' => \App\Http\Middleware\EnsureUserHasPermission::class]);
 *   })
 *
 * Then gate a route (or group) with:
 *
 *   Route::get('/', [UserController::class, 'index'])
 *       ->middleware('permission:users.view');
 *
 * A user with no role, or whose role lacks that permission_name in
 * role_permissions, gets a 403. Runs after auth:sanctum, so $request->user()
 * is always present here.
 */
class EnsureUserHasPermission
{
    public function handle(Request $request, Closure $next, string $permissionName): Response
    {
        $user = $request->user();
        $role = $user?->role()->with('permissions')->first();

        if (! $role || ! $role->hasPermission($permissionName)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to perform this action.',
            ], 403);
        }

        return $next($request);
    }
}