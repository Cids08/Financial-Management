<?php

namespace App\Console\Commands;

use App\Models\Setting;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Deletes branding logo files in storage that are no longer referenced
 * by the (now-consolidated) settings row.
 *
 * These accumulated as a side effect of the settings-row-forking bug:
 * each stray row's logo upload wrote a real file to storage/app/public/branding,
 * but only the file referenced by the surviving row is still in use.
 *
 * Usage:
 *   php artisan settings:clean-orphaned-logos --dry-run   (list only, deletes nothing)
 *   php artisan settings:clean-orphaned-logos              (prompts, then deletes)
 */
class CleanOrphanedLogos extends Command
{
    protected $signature = 'settings:clean-orphaned-logos {--dry-run : List orphaned files without deleting them}';

    protected $description = 'Delete branding logo files in storage not referenced by the current settings row';

    protected const DISK = 'public';
    protected const DIR = 'branding';

    public function handle(): int
    {
        $currentLogo = Setting::current()->company_logo;

        if (! Storage::disk(self::DISK)->exists(self::DIR)) {
            $this->info('No branding directory found — nothing to clean.');
            return self::SUCCESS;
        }

        $allFiles = Storage::disk(self::DISK)->files(self::DIR);
        $orphaned = array_filter($allFiles, fn ($path) => $path !== $currentLogo);

        if (empty($orphaned)) {
            $this->info('No orphaned logo files found.');
            return self::SUCCESS;
        }

        $this->info('Current logo in use: ' . ($currentLogo ?? '(none)'));
        $this->newLine();
        $this->info(count($orphaned) . ' orphaned file(s) found:');
        foreach ($orphaned as $path) {
            $this->line("  - {$path}");
        }

        if ($this->option('dry-run')) {
            $this->newLine();
            $this->comment('Dry run — no files were deleted.');
            return self::SUCCESS;
        }

        if (! $this->confirm("\nDelete these " . count($orphaned) . ' file(s)?', false)) {
            $this->comment('Aborted — no files were deleted.');
            return self::SUCCESS;
        }

        Storage::disk(self::DISK)->delete(array_values($orphaned));

        $this->info('Deleted ' . count($orphaned) . ' orphaned logo file(s).');

        return self::SUCCESS;
    }
}