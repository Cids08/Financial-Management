<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class HoneypotCheck
{
    /**
     * Blocks bots on public endpoints (login, etc.) before they ever reach
     * the controller/rate limiter. Two checks:
     *   1. A decoy field ("website") that only an automated form-filler
     *      would populate — real users never see it (hidden via CSS, not
     *      type="hidden", since some bots skip those).
     *   2. A timing trap — form submitted faster than a human could
     *      realistically fill it in.
     *
     * On trigger: log it and return a fake success response, so the bot
     * doesn't learn it was caught and doesn't retry with a different
     * strategy.
     */
    public function handle(Request $request, Closure $next)
    {
        if (filled($request->input('website'))) {
            $this->logTrigger($request, 'field');
            return $this->fakeSuccess();
        }

        $renderedAt = $request->input('form_rendered_at');
        if ($renderedAt && (time() - (int) $renderedAt) < 2) {
            $this->logTrigger($request, 'timing');
            return $this->fakeSuccess();
        }

        return $next($request);
    }

    private function logTrigger(Request $request, string $type): void
    {
        Log::channel('security')->warning('Honeypot triggered', [
            'type'  => $type,
            'ip'    => $request->ip(),
            'route' => $request->path(),
            'agent' => $request->userAgent(),
        ]);
    }

    private function fakeSuccess()
    {
        return response()->json([
            'success' => true,
            'message' => 'Request received.',
            'data'    => [],
        ], 200);
    }
}