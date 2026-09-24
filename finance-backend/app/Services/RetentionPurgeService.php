<?php

namespace App\Services;

use App\Http\Controllers\Api\PermanentDeleteController;
use App\Models\Setting;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;

/**
 * Data Privacy Act retention purge: permanently deletes ARCHIVED records
 * whose soft-deleted date is older than the configured retention window
 * (settings.data_retention_days, default 10 years per BIR books-of-accounts
 * rules). Records still referenced by other rows (e.g. a cash account with
 * related disbursements) are skipped and reported, never crashed on.
 *
 * Runs on a schedule (records:purge-archived) AND lazily at most once an
 * hour from EnforceRetentionPolicy middleware so the purge happens even if
 * the host never runs the Laravel scheduler.
 */
class RetentionPurgeService
{
    /**
     * Cache key that records the last time a lazy purge actually ran, so
     * the request-pipeline fallback only shops once per hour.
     */
    public const LAST_RUN_KEY = 'retention_purge_last_run';

    /**
     * Seconds between lazy purge attempts from Append middleware.
     */
    public const LAZY_INTERVAL_SECONDS = 3600;

    public function retentionDays(): int
    {
        return (int) (Setting::current()->data_retention_days ?: 3650);
    }

    /**
     * @return array{retention_days:int, cutoff:string, per_entity:array<int<0,max>,array{entity:string,model:string,purged:int,skipped:int}>}
     */
    public function purge(): array
    {
        $days = $this->retentionDays();
        $cutoff = now()->subDays($days);

        $perEntity = [];

        foreach (PermanentDeleteController::ENTITIES as $entity => $cfg) {
            $ids = $cfg['model']::onlyTrashed()
                ->where('deleted_at', '<', $cutoff)
                ->pluck('id');

            $purged = 0;
            $skipped = 0;

            foreach ($ids as $id) {
                $record = $cfg['model']::onlyTrashed()->find($id);
                if (! $record) {
                    continue;
                }

                try {
                    $record->forceDelete();
                    $purged++;
                } catch (QueryException $e) {
                    // Cross-row FK (RESTRICT) still pointing at this record  -  keep it.
                    $skipped++;
                    Log::warning("[retention] Skipped {$entity} #{$id} still referenced by related records: {$e->getMessage()}");
                }
            }

            if ($purged > 0 || $skipped > 0) {
                $perEntity[] = [
                    'entity' => $entity,
                    'model' => $cfg['model'],
                    'purged' => $purged,
                    'skipped' => $skipped,
                ];
            }
        }

        return [
            'retention_days' => $days,
            'cutoff' => $cutoff->toDateTimeString(),
            'per_entity' => $perEntity,
        ];
    }

    /**
     * Lightweight once-per-hour entry point used by request middleware so
     * the retention purge also runs on hosts without a working scheduler.
     * Returns true when a purge attempt actually executed this call.
     */
    public function attempt(): bool
    {
        $lastRun = (int) cache()->get(self::LAST_RUN_KEY, 0);
        if ($lastRun && (time() - $lastRun) < self::LAZY_INTERVAL_SECONDS) {
            return false;
        }

        // Atomic lock so concurrent requests can't double-run the purge.
        $lock = cache()->lock('retention_purge_lock', 120);
        if (! $lock->get()) {
            return false;
        }

        try {
            $this->purge();
            cache()->put(self::LAST_RUN_KEY, time(), now()->addDay());
        } catch (\Throwable $e) {
            Log::error("[retention] Lazy purge failed: {$e->getMessage()}");
        } finally {
            $lock->release();
        }

        return true;
    }
}