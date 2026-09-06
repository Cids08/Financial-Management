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
        // All aliases MUST live in this single withMiddleware() call —
        // it assigns one callback internally, so a second ->withMiddleware()
        // call elsewhere would silently replace this one instead of
        // merging with it.
        $middleware->alias([
            'permission' => \App\Http\Middleware\CheckPermission::class,
            'honeypot' => \App\Http\Middleware\HoneypotCheck::class,
            'require.password.change' => \App\Http\Middleware\EnsurePasswordChanged::class,
        ]);

        $middleware->api(append: [
            \App\Http\Middleware\SecurityHeaders::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
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