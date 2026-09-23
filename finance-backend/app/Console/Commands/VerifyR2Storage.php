<?php

namespace App\Console\Commands;

use App\Support\FileStorage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

final class VerifyR2Storage extends Command
{
    protected $signature = 'r2:verify {--probe : attempt a live bucket listing to prove connectivity}';

    protected $description = 'Diagnose R2 wiring WITHOUT curl, using cached config so it stays correct under config:cache (production).';

    public function handle(): int
    {
        $disk    = config('filesystems.disks.r2');
        $default = config('filesystems.default');

        $creds = [
            'R2_ACCESS_KEY_ID'     => $disk['key'] ?? null,
            'R2_SECRET_ACCESS_KEY' => $disk['secret'] ?? null,
            'R2_BUCKET'            => $disk['bucket'] ?? null,
            'R2_ENDPOINT'          => $disk['endpoint'] ?? null,
        ];
        $missing = array_keys(array_filter($creds, fn ($v) => empty($v)));

        $fail = 0;
        $this->line('');
        $check = static function (bool $ok, string $msg) use (&$fail): void {
            $fail += $ok ? 0 : 1;
            echo ($ok ? "PASS  " : "FAIL  ") . $msg . PHP_EOL;
        };

        $check($disk !== null, 'r2 disk registered in config/filesystems.php'
            . ($disk ? " (driver={$disk['driver']})" : ''));
        $check($default === FileStorage::DISK,
            "FILESYSTEM_DISK is \"{$default}\" (expected \"" . FileStorage::DISK . "\")");
        $check($missing === [], 'R2 credentials present in config'
            . ($missing ? ' — missing: ' . implode(', ', $missing) : ''));
        $check(FileStorage::supportsSignedUrls(),
            'FileStorage signed-URL support: ' . (FileStorage::supportsSignedUrls() ? 'yes' : 'NO — falling back to raw URL'));

        $this->line('');
        $this->line('TTLs: documents=' . FileStorage::DOCUMENT_TTL_SECONDS . 's, images=' . FileStorage::IMAGE_TTL_SECONDS . 's');

        if ($this->option('probe')) {
            if ($missing) {
                $this->error("PROBE skipped — fill R2_* first, then rebuild config cache.");
                return self::FAILURE;
            }
            try {
                $n = count(Storage::disk(FileStorage::DISK)->files('/', true));
                $this->info("PROBE OK — bucket reachable, {$n} object(s) listed.");
            } catch (\Throwable $e) {
                $this->error('PROBE FAILED: ' . $e->getMessage());
                return self::FAILURE;
            }
        }

        $this->line('');
        return $fail === 0 ? self::SUCCESS : self::FAILURE;
    }
}
