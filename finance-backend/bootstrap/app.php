<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Both aliases MUST live in this single withMiddleware() call —
        // it assigns one callback internally, so a second ->withMiddleware()
        // call elsewhere would silently replace this one instead of
        // merging with it. That bug previously dropped the 'permission'
        // alias entirely once 'honeypot' was added in a separate call.
        $middleware->alias([
            'permission' => \App\Http\Middleware\CheckPermission::class,
            'honeypot' => \App\Http\Middleware\HoneypotCheck::class,
        ]);

        // Scoped to the api group specifically, since this is an
        // API-only backend serving a separate React SPA — there's no
        // HTML being rendered here for the strict CSP to conflict with.
        $middleware->api(append: [
            \App\Http\Middleware\SecurityHeaders::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Format throttle (429) responses to match the API's standard
        // { success, message, data } shape, and surface retryAfter so the
        // frontend can show a live countdown instead of a static message.
        $exceptions->render(function (ThrottleRequestsException $e, $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            $retryAfter = (int) ($e->getHeaders()['Retry-After'] ?? 60);

            return response()->json([
                'success' => false,
                'message' => "Too many attempts. Please try again in {$retryAfter} seconds.",
                'data' => ['retryAfter' => $retryAfter],
            ], 429);
        });
    })->create();