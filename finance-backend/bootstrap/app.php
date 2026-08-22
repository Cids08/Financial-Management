<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'permission' => \App\Http\Middleware\CheckPermission::class,
        ]);
    })
    ->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'honeypot' => \App\Http\Middleware\HoneypotCheck::class,
        // ...your existing aliases (e.g. 'permission' => ...)
    ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();