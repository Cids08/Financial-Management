<?php

namespace App\Console\Commands;

use App\Services\DisbursementService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Runs DisbursementService::reconcileReleasedDisbursements() on purpose.
 *
 * This reconciliation used to be triggered by GET /api/disbursements and
 * GET /api/disbursements/stats, so simply listing disbursements deleted
 * journal entries, incremented cash balances and rewrote AP paid_amount.
 * It is now only run deliberately, from here.
 *
 * Dry run by default. A dry run must write NOTHING, so it does not call the
 * reconciler at all: it re-derives, with read-only queries, the same
 * conditions the reconciler acts on and reports what would change. The
 * reconciler itself is only invoked once --apply is passed.
 *
 * The reconciler is idempotent, so --apply can be run repeatedly, but it is
 * still a ledger write and should be a conscious act rather than a side
 * effect of a page load.
 *
 * Usage:
 *   php artisan ledger:reconcile           report only, writes nothing
 *   php artisan ledger:reconcile --apply   apply the repairs
 */
class LedgerReconcile extends Command
{
    protected $signature = 'ledger:reconcile
                            {--apply : Actually write the repairs (default is a dry run)}';

    protected $description = 'Repair the disbursement ledger (duplicate postings, cash leg, AP balances). Dry run unless --apply.';

    /** reference_type spellings the reconciler normalises. */
    private const REF_TYPES = ['disbursement', 'Disbursement', 'Disbursements'];

    public function handle(DisbursementService $service): int
    {
        $apply = (bool) $this->option('apply');

        if (! $apply) {
            $this->warn('Dry run — nothing will be written. Re-run with --apply to repair.');
            $this->newLine();

            return $this->report();
        }

        $before = $this->counts();

        try {
            $service->reconcileReleasedDisbursements();
        } catch (\Throwable $e) {
            // The service swallows its own failures into a log line, so a
            // partial repair can surface here as "no change" rather than an
            // exception. Say so explicitly instead of reporting success.
            $this->error('Reconciliation aborted: '.$e->getMessage());

            return self::FAILURE;
        }

        $after = $this->counts();
        $this->table(['Metric', 'Before', 'After'], [
            ['journal entries (incl. soft-deleted)', $before['entries'], $after['entries']],
            ['journal entry lines', $before['lines'], $after['lines']],
            ['AP paid_amount total', $before['ap_paid'], $after['ap_paid']],
        ]);

        $changed = $before !== $after;

        $this->newLine();
        $this->info($changed
            ? 'Reconciliation applied. Run ledger:integrity to confirm the result.'
            : 'Reconciliation applied; ledger already consistent.');

        return self::SUCCESS;
    }

    /**
     * Read-only preview: enumerates every condition the reconciler acts on
     * and what it would do, without touching a row.
     */
    private function report(): int
    {
        $duplicates = $this->duplicatePostings();
        $statusFixes = $this->statusFixes();
        $apRepairs = $this->apRepairs();
        $legacy = (int) DB::table('journal_entry_lines')
            ->where('reference_type', 'disbursement')
            ->count();

        $total = $duplicates->count() + count($statusFixes) + count($apRepairs) + $legacy;

        if ($duplicates->isNotEmpty()) {
            $this->line('duplicate postings to prune:');
            $this->table(
                ['disbursement_id', 'entries', 'ids (lowest kept)'],
                $duplicates->map(fn ($r) => [$r->id, $r->n, $r->ids])->all()
            );
        }

        if ($statusFixes->isNotEmpty()) {
            $this->line('disbursements whose status would be forced to Released:');
            $this->table(['id', 'current status'], $statusFixes->map(fn ($r) => [$r->id, $r->status])->all());
        }

        if ($apRepairs->isNotEmpty()) {
            $this->line('AP bills whose paid/remaining/status would be rebuilt:');
            $this->table(
                ['id', 'invoice', 'paid now → would be', 'status now → would be'],
                $apRepairs->map(fn ($r) => [
                    $r->id,
                    $r->invoice_number,
                    $r->paid_amount.' → '.$r->want_paid,
                    $r->status.' → '.$r->want_status,
                ])->all()
            );
        }

        if ($legacy > 0) {
            $this->line("legacy lowercase reference_type lines: {$legacy}");
        }

        $this->newLine();

        if ($total === 0) {
            $this->info('Dry run found nothing to repair.');

            return self::SUCCESS;
        }

        $this->info("Dry run found {$total} pending repair(s). Re-run with --apply.");

        return self::SUCCESS;
    }

    /**
     * Reference ids carrying more than one journal entry. Uses pluck +
     * a second query rather than GROUP_CONCAT/STRING_AGG so it runs on both
     * Postgres and SQLite.
     */
    private function duplicatePostings()
    {
        $ids = DB::table('journal_entry_lines')
            ->whereIn('reference_type', self::REF_TYPES)
            ->groupBy('reference_id')
            ->havingRaw('COUNT(DISTINCT journal_entry_id) > 1')
            ->pluck('reference_id');

        return $ids->map(fn ($refId) => (object) [
            'id' => $refId,
            'n' => DB::table('journal_entry_lines')
                ->where('reference_type', self::REF_TYPES)
                ->where('reference_id', $refId)
                ->distinct()
                ->count('journal_entry_id'),
            'ids' => implode(',', DB::table('journal_entry_lines')
                ->where('reference_type', self::REF_TYPES)
                ->where('reference_id', $refId)
                ->distinct()
                ->orderBy('journal_entry_id')
                ->pluck('journal_entry_id')
                ->all()),
        ]);
    }

    /** Disbursements that have a posted entry but are not yet Released. */
    private function statusFixes()
    {
        return DB::table('disbursements as d')
            ->whereNull('d.deleted_at')
            ->where('d.status', '!=', 'Released')
            ->whereExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('journal_entry_lines as l')
                    ->join('journal_entries as e', 'e.id', '=', 'l.journal_entry_id')
                    ->whereNull('e.deleted_at')
                    ->where('e.status', 'Posted')
                    ->whereColumn('l.reference_id', 'd.id')
                    ->whereIn('l.reference_type', self::REF_TYPES);
            })
            ->get(['d.id', 'd.status']);
    }

    /**
     * AP bills whose stored paid/remaining/status disagree with the
     * journal-derived truth. Mirrors the reconciler's own repair formula
     * exactly, so a dry run predicts a no-op run rather than inventing work.
     */
    private function apRepairs()
    {
        return DB::table('accounts_payable as ap')
            ->whereNull('ap.deleted_at')
            ->whereIn('ap.id', function ($q) {
                $q->select('ap_id')->from('disbursements')
                    ->whereNull('deleted_at')
                    ->where('status', 'Released')
                    ->whereNotNull('ap_id');
            })
            ->get()
            ->filter(function ($ap) {
                // Raw table query, so soft-deleted disbursements are
                // included by default — matching the reconciler, which uses
                // Disbursement::withTrashed() for this total.
                $released = (float) DB::table('disbursements')
                    ->where('ap_id', $ap->id)
                    ->where('status', 'Released')
                    ->sum('amount_paid');

                $wantPaid = min($released, (float) $ap->original_amount);
                $wantRemaining = max(0, (float) $ap->original_amount - $wantPaid);

                // Mirrors DisbursementService's status rule, including the
                // guard that keeps Overdue/Cancelled untouched. If these two
                // ever drift apart, the dry run stops predicting --apply and
                // becomes a lie, so LedgerReadPathTest pins them together.
                $wantStatus = match (true) {
                    $wantRemaining <= 0 => 'Paid',
                    in_array($ap->status, ['Overdue', 'Cancelled'], true) => $ap->status,
                    $wantPaid > 0 => 'Partially Paid',
                    default => $ap->status,
                };

                $dirty = round((float) $ap->paid_amount, 2) !== round($wantPaid, 2)
                    || round((float) $ap->remaining_balance, 2) !== round($wantRemaining, 2)
                    || $ap->status !== $wantStatus;

                $ap->want_paid = $wantPaid;
                $ap->want_status = $wantStatus;

                return $dirty;
            })
            ->values();
    }

    /**
     * Counts for the before/after table.
     *
     * AP paid_amount is compared as a string on purpose: these are
     * decimal(15,2) columns, and summing them as floats invites a rounding
     * diff that has nothing to do with the repair.
     */
    private function counts(): array
    {
        return [
            'entries' => (int) DB::table('journal_entries')->count(),
            'lines' => (int) DB::table('journal_entry_lines')->count(),
            'ap_paid' => (string) DB::table('accounts_payable')
                ->whereNull('deleted_at')
                ->sum('paid_amount'),
        ];
    }
}
