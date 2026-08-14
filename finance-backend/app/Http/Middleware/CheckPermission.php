<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Usage in routes/api.php:
 *
 *   Route::get('budgets/{budget}/approve', ...)
 *       ->middleware('permission:budgets_approval.approve');
 *
 * Register the alias in bootstrap/app.php (Laravel 11) or
 * app/Http/Kernel.php (Laravel 10) — see the note in the route snippet file.
 */
class CheckPermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'data' => null,
            ], 401);
        }

        if (! $user->hasPermission($permission)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to perform this action.',
                'data' => null,
            ], 403);
        }

        return $next($request);
    }
}