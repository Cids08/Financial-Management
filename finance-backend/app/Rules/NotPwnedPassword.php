<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Rejects passwords that appear in known data breaches, via the
 * HaveIBeenPwned "Pwned Passwords" API.
 *
 * Privacy: uses k-anonymity — only the first 5 characters of the SHA-1
 * hash are ever sent to the API. HIBP returns every hash suffix sharing
 * that prefix (typically several hundred), and the actual match is
 * checked locally. The real password, and even its full hash, never
 * leave this server.
 *
 * Fails OPEN on any network error: if the HIBP API is unreachable or
 * slow, the password is allowed through rather than blocking account
 * creation or a password change over a third-party outage. This mirrors
 * GeoIpService's fail-open behavior for the same reason.
 */
class NotPwnedPassword implements ValidationRule
{
    protected const TIMEOUT_SECONDS = 3;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || $value === '') {
            return;
        }

        $hash = strtoupper(sha1($value));
        $prefix = substr($hash, 0, 5);
        $suffix = substr($hash, 5);

        try {
            $response = Http::timeout(self::TIMEOUT_SECONDS)
                ->get("https://api.pwnedpasswords.com/range/{$prefix}");

            if (! $response->ok()) {
                return; // fail open
            }

            foreach (explode("\r\n", trim($response->body())) as $line) {
                [$candidateSuffix, $count] = explode(':', $line);

                if (hash_equals($candidateSuffix, $suffix)) {
                    $fail(sprintf(
                        'This password has appeared in %s known data breach%s. Please choose a different password.',
                        number_format((int) $count),
                        ((int) $count === 1) ? '' : 'es'
                    ));

                    return;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('HaveIBeenPwned lookup failed', ['error' => $e->getMessage()]);
            // Fail open — see class docblock.
        }
    }
}