<?php

namespace App\Http\Middleware;

use App\Services\RetentionPurgeService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Fallback for hosts that never run the Laravel scheduler (cron). Piggybacks
 * a once-per-hour retention purge attempt onto authenticated API requests,
 * so archived records past the retention window are still auto-deleted
 * "immediately" even with no scheduled job configured.
 */
class EnforceRetentionPolicy
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()) {
            app(RetentionPurgeService::class)->attempt();
        }

        return $next($request);
    }
}