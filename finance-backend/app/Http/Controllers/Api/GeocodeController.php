<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Free street-level geocoding via OpenStreetMap / Nominatim (open data, no
 * API key). The static GOOGLE_PLACES_INDEX only covers cities/municipalities
 * (official PSGC) plus a handful of curated streets, so this endpoint is the
 * "any street" fallback (Panay Avenue, Timog Ave, ... or a full address).
 *
 * Nominatim usage policy: needs a descriptive User-Agent, ≤1 request/second,
 * and responses are cached. We send an identifiable UA, the route applies a
 * per-user throttle, and every result is cached in Laravel's cache for 30
 * days so repeat lookups never touch the API again.
 */
class GeocodeController extends Controller
{
    private const MIN_QUERY = 3;
    private const LIMIT = 5;
    private const CACHE_TTL = 60 * 60 * 24 * 30;

    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));

        if (mb_strlen($q) < self::MIN_QUERY) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $cacheKey = 'geocode:'.md5(mb_strtolower($q));
        $results = Cache::get($cacheKey);

        if ($results === null) {
            $results = $this->queryNominatim($q);
            Cache::put($cacheKey, $results, self::CACHE_TTL);
        }

        return response()->json(['success' => true, 'data' => $results]);
    }

    private function queryNominatim(string $q): array
    {
        try {
            $response = Http::timeout(6)
                ->retry(1, 300)
                ->withHeaders([
                    'User-Agent' => 'FMS-Capstone/1.0 (address-autocomplete; academic project)',
                    'Accept-Language' => 'en',
                ])->get('https://nominatim.openstreetmap.org/search', [
                    'q' => $q,
                    'format' => 'json',
                    'addressdetails' => 1,
                    'extratags' => 1,
                    'limit' => self::LIMIT,
                ]);

            if (! $response->successful()) {
                return [];
            }

            $places = $response->json();
            if (! is_array($places)) {
                return [];
            }

            $places = array_column($places, null, 'place_id');

            $results = array_map(fn (array $p) => $this->toPlace($p), array_slice($places, 0, self::LIMIT));

            // Nominatim often returns the same street twice (different OSM
            // layers/ways) — collapse exact duplicate suggestions.
            $results = array_values(array_combine(
                array_map(fn (array $r) => $r['description'], $results),
                $results
            ));

            return $results;
        } catch (\Throwable $e) {
            // Offline demo, DNS failure, or Nominatim hiccup must never break
            // address search — the static index simply takes over.
            return [];
        }
    }

    private function toPlace(array $p): array
    {
        $addr = $p['address'] ?? [];

        $number = $addr['house_number'] ?? '';
        $road = $addr['road'] ?? '';
        $route = trim(implode(' ', array_filter([$number, $road])));

        $city = $addr['city']
            ?? $addr['town']
            ?? $addr['municipality']
            ?? $addr['village']
            ?? $addr['suburb']
            ?? $addr['neighbourhood']
            ?? '';

        // For Philippine addresses OSM stores the province under "region"
        // ("Metro Manila", "CALABARZON", ...). Keep our index consistent by
        // preferring region, then state, then state_district.
        $state = $addr['region']
            ?? $addr['state']
            ?? $addr['state_district']
            ?? '';
        $country = $addr['country'] ?? 'Philippines';
        $countryCode = strtoupper((string) ($addr['country_code'] ?? '')) ?: 'PH';
        $postal = $addr['postcode'] ?? '';
        $suburb = $addr['suburb'] ?? '';

        if ($route !== '') {
            $cityPart = $suburb !== '' && $suburb !== $city ? $suburb.', '.$city : $city;
            $description = trim(implode(', ', array_filter([$route, $cityPart, $state, $country])));
        } else {
            // City/municipality-level hit: use Nominatim's display name.
            $description = (string) ($p['display_name'] ?? $p['name'] ?? $route);
        }

        return [
            'description' => $description,
            'address_components' => [
                'route' => $route,
                'locality' => $city,
                'administrative_area_level_1' => $state,
                'country' => $country,
                'country_code' => $countryCode,
                'postal_code' => $postal,
            ],
            'isLocal' => $countryCode === 'PH',
        ];
    }
}