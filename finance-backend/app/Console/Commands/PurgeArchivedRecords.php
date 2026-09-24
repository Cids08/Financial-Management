<?php

namespace App\Console\Commands;

use App\Services\RetentionPurgeService;
use Illuminate\Console\Command;

class PurgeArchivedRecords extends Command
{
    protected $signature = 'records:purge-archived';

    protected $description = 'Permanently delete archived records past the data-retention window (Data Privacy Act / BIR books-of-accounts retention).';

    public function handle(RetentionPurgeService $service): int
    {
        $result = $service->purge();

        $total = array_sum(array_column($result['per_entity'], 'purged'));
        $skipped = array_sum(array_column($result['per_entity'], 'skipped'));

        foreach ($result['per_entity'] as $line) {
            $this->line("  {$line['entity']}: purged {$line['purged']}, skipped {$line['skipped']}");
        }

        if ($total === 0 && $skipped === 0) {
            $this->info("No archived records are past the {$result['retention_days']}-day retention window (cutoff {$result['cutoff']}).");
        } else {
            $this->info("Purged {$total} archived record(s), skipped {$skipped} still-referenced record(s) (cutoff {$result['cutoff']}).");
        }

        return self::SUCCESS;
    }
}