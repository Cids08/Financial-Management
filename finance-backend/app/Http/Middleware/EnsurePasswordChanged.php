<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsurePasswordChanged
{
    /**
     * Routes a must_change_password user is still allowed to hit — just
     * enough to change their password and sign out. Everything else on
     * the API is blocked until they do, via a distinct 423 response the
     * frontend intercepts to show a blocking "change your password"
     * modal (see MustChangePasswordListener.jsx).
     */
    protected const ALLOWED_PATHS = [
        'PUT api/settings/password',
        'POST api/logout',
        'GET api/profile',
    ];

    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if (! $user || ! $user->must_change_password) {
            return $next($request);
        }

        $current = $request->method() . ' ' . ltrim($request->path(), '/');

        if (in_array($current, self::ALLOWED_PATHS, true)) {
            return $next($request);
        }

        return response()->json([
            'success' => false,
            'message' => 'You must change your password before continuing.',
            'data' => ['mustChangePassword' => true],
        ], 423);
    }
}