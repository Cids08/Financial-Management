<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        // Forces HTTPS on every future request for a year, including
        // subdomains. Harmless over plain HTTP in local dev — browsers
        // only honor this header when it arrives over a connection
        // that's already HTTPS, so it's inert on http://localhost.
        $response->headers->set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains'
        );

        // Stops the browser from guessing/overriding a response's
        // declared Content-Type — blocks a class of attack where a
        // malicious file uploaded as e.g. an "image" gets sniffed and
        // executed as HTML/JS instead.
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        // This API should never be rendered inside a frame/iframe on any
        // site, including your own — eliminates clickjacking on every
        // endpoint at once, cheaper than a per-page defense.
        $response->headers->set('X-Frame-Options', 'DENY');

        // Sends the full referring URL only to your own origin; strips it
        // down to just the domain for any cross-origin request. Prevents
        // e.g. a URL containing a password-reset token from leaking to a
        // third-party site via the Referer header on an outbound link/asset.
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Explicitly denies browser features this app has no legitimate
        // use for. If a XSS payload ever did execute, this stops it from
        // being able to request camera/mic/location access on top of
        // whatever else it might attempt.
        $response->headers->set(
            'Permissions-Policy',
            'camera=(), microphone=(), geolocation=(), payment=()'
        );

        // A JSON API has no legitimate reason to load scripts, styles, or
        // frames of its own — this is the strictest possible CSP and is
        // safe here specifically because responses are JSON, not HTML.
        // (Do NOT copy this verbatim onto the frontend's own CSP — the
        // React app actually needs to load its own scripts/styles and
        // would need a much less restrictive policy.)
        $response->headers->set(
            'Content-Security-Policy',
            "default-src 'none'; frame-ancestors 'none'"
        );

        return $response;
    }
}