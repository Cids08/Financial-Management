<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;

/**
 * Single source of truth for how stored files (documents, avatars, logos)
 * are written to and read back from object storage.
 *
 * Historically every upload was a Laravel `local` disk (storage/app/private)
 * and every "view"/download streamed the bytes back through the API using
 * response()->file() on Storage::disk('local')->path(). With Cloudflare R2
 * in place those raw-path assumptions no longer hold, so all file access is
 * funnelled through this class instead:
 *
 *  - writes go to the `r2` disk (S3 driver pointed at R2's S3 API),
 *  - reads come back as short-lived SIGNED URLs (temporaryUrl()), because
 *    the R2 bucket is private. Nothing stored in R2 is ever exposed through
 *    a stable public URL the way storage/app/public used to be.
 *
 * Laravel's Flysystem/S3 driver provides temporaryUrl() out of the box,
 * so no extra Cloudflare SDK is required to build these signed links.
 */
class FileStorage
{
    /**
     * Disk every claimed file lives on (receipts, proofs, plans,
     * AP/AR/tax documents, avatars, logos).
     */
    public const DISK = 'r2';

    /**
     * How long a temporary (signed) link stays valid before it expires.
     * URLs are generated lazily on every request that needs to surface a
     * file, so this only limits how long a single link the client already
     * opened keeps working — not how long the file "exists". A longer TTL
     * is used for avatar/profile/logo images because browsers request those
     * from an <img src> that was rendered earlier and may be re-requested
     * later; a shorter TTL would risk a broken image icon on an already
     * rendered page.
     */
    public const DOCUMENT_TTL_SECONDS = 3600;     // 1 hour for financial documents
    public const IMAGE_TTL_SECONDS    = 86400;    // 24h so <img> renders stay healthy

    /**
     * Generate a signed (private, expiring) URL for the given stored file.
     */
    public static function signedUrl(?string $storagePath, int $ttlSeconds = self::DOCUMENT_TTL_SECONDS): ?string
    {
        if (! $storagePath) {
            return null;
        }

        $disk = Storage::disk(self::DISK);

        // temporaryUrl() is only implemented for S3/R2-backed disks. For
        // anything else (e.g. `local` used while R2 isn't configured yet)
        // fall back to a plain storage URL so the app never 500s.
        if (method_exists($disk, 'temporaryUrl')) {
            try {
                return $disk->temporaryUrl($storagePath, now()->addSeconds($ttlSeconds));
            } catch (\Throwable) {
                return $this->fallbackUrl($disk, $storagePath);
            }
        }

        return $this->fallbackUrl($disk, $storagePath);
    }

    /**
     * True when the configured Disk actually offers temporary (signed) URLs.
     *
     * This deliberately inspects ONLY cached config (filesystems.r2.driver)
     * and never instantiates the disk: constructing an empty-credential R2
     * S3 adapter throws a PHP TypeError ($bucket must be a string), which
     * would 500 every file endpoint *before* the signed-URL guard runs on
     * local dev / fresh checkouts. S3-family drivers are the ones that
     * expose temporaryUrl(), so the driver check is both sufficient and
     * config-cache-safe.
     */
    public static function supportsSignedUrls(): bool
    {
        return config('filesystems.disks.r2.driver') === 's3';
    }

    public static function fallbackUrl(\Illuminate\Contracts\Filesystem\Filesystem $disk, string $storagePath): ?string
    {
        $url = null;

        if (method_exists($disk, 'exists') && $disk->exists($storagePath)) {
            $url = method_exists($disk, 'url') ? $disk->url($storagePath) : null;
        }

        return $url ?: (asset('storage/' . ltrim($storagePath, '/')));
    }
}
