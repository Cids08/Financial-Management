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

        // HostForge terminates TLS on its edge and forwards the real client
        // IP via X-Forwarded-For. Without trusting the proxy, request()->ip()
        // reports the edge/container network IP (a Hostinger/Malaysia range)
        // and GeoIP shows "Kuala Lumpur, Malaysia" for every login instead of
        // the user's actual city. Trust all proxies so the forwarded IP wins.
        $middleware->trustProxies(at: '*');

        $middleware->api(append: [
            \App\Http\Middleware\SecurityHeaders::class,
            \App\Http\Middleware\EnforceRetentionPolicy::class,
        ]);
    })
    ->withSchedule(function (\Illuminate\Console\Scheduling\Schedule $schedule): void {
        // Data Privacy Act retention: nightly permanent purge of archived
        // records older than settings.data_retention_days. Host must run
        // `php artisan schedule:run` every minute; the EnforceRetentionPolicy
        // middleware is the fallback for hosts without a working scheduler.
        $schedule->command('records:purge-archived')->dailyAt('02:30');
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