<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeoIpService
{
    protected const CACHE_TTL_HOURS = 24;
    protected const TIMEOUT_SECONDS = 2;

    /**
     * Resolve a "City, Country" label for an IP address.
     * Never throws — a lookup failure must never block login/session flows.
     * Returns null for private/local IPs (dev environments, VPNs, etc.).
     */
    public function locate(?string $ip): ?string
    {
        if (! $ip || ! $this->isPublic($ip)) {
            return null;
        }

        return Cache::remember("geoip:{$ip}", now()->addHours(self::CACHE_TTL_HOURS), function () use ($ip) {
            try {
                $response = Http::timeout(self::TIMEOUT_SECONDS)
                    ->get("http://ip-api.com/json/{$ip}", ['fields' => 'status,city,country']);

                if (! $response->ok() || ($response->json('status') !== 'success')) {
                    return null;
                }

                return collect([$response->json('city'), $response->json('country')])
                    ->filter()
                    ->implode(', ') ?: null;
            } catch (\Throwable $e) {
                Log::warning('GeoIP lookup failed', ['ip' => $ip, 'error' => $e->getMessage()]);
                return null;
            }
        });
    }

    protected function isPublic(string $ip): bool
    {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    }
}