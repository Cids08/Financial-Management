<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Reports ledger integrity problems. READ ONLY — this command never writes.
 *
 * Built to answer "what exactly is wrong in production?" without needing
 * access to the database or trusting a UI figure. Each category below is
 * something that can leave the books disagreeing with the trial balance:
 *
 *   dangling lines        journal_entry_lines whose journal_entry_id has no
 *                         journal_entries row at all. journal_entry_lines
 *                         hard-deletes while journal_entries soft-deletes,
 *                         so a row here is not something the model layer
 *                         can clean up for you.
 *   orphaned lines        lines still attached to a SOFT-DELETED entry. The
 *                         entry is gone from every normal query, but the
 *                         lines are still on disk and still sum into account
 *                         balances — this is the shape that produces
 *                         "posted lines nobody can find".
 *   unbalanced entries    entries where debits != credits. These distort
 *                         the trial balance directly.
 *   duplicate postings    more than one journal entry for the same
 *                         disbursement, which is what ledger:reconcile
 *                         exists to prune.
 *   legacy reference_type lines still carrying the lowercase 'disbursement'
 *                         value, which some lookups do not match.
 *
 * Usage:
 *   php artisan ledger:integrity
 *   php artisan ledger:integrity --limit=25    (rows shown per category)
 */
class LedgerIntegrity extends Command
{
    protected $signature = 'ledger:integrity {--limit=10 : Rows to list per category}';

    protected $description = 'Report ledger integrity problems (read only)';

    public function handle(): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $problems = 0;

        // 1. Lines pointing at an entry that does not exist at all.
        $dangling = DB::table('journal_entry_lines as l')
            ->leftJoin('journal_entries as e', 'e.id', '=', 'l.journal_entry_id')
            ->whereNull('e.id')
            ->count();
        $this->line('dangling lines (no parent entry)');
        if ($dangling > 0) {
            $problems++;
            $this->table(['journal_entry_line_id', 'journal_entry_id', 'account_id', 'debit', 'credit'], DB::table('journal_entry_lines')
                ->whereNotIn('journal_entry_id', DB::table('journal_entries')->select('id'))
                ->limit($limit)
                ->get(['id', 'journal_entry_id', 'account_id', 'debit', 'credit'])
                ->map(fn ($r) => [
                    $r->id, $r->journal_entry_id, $r->account_id,
                    (string) $r->debit, (string) $r->credit,
                ])->all());
        }
        $this->line("  <info>{$dangling}</info>");
        $this->newLine();

        // 2. Lines hanging off a soft-deleted entry.
        $orphaned = DB::table('journal_entry_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.journal_entry_id')
            ->whereNotNull('e.deleted_at')
            ->count();
        $this->line('orphaned lines (parent entry soft-deleted)');
        if ($orphaned > 0) {
            $problems++;
            $this->table(['line_id', 'journal_entry_id', 'entry_deleted_at', 'account_id', 'debit', 'credit'], DB::table('journal_entry_lines as l')
                ->join('journal_entries as e', 'e.id', '=', 'l.journal_entry_id')
                ->whereNotNull('e.deleted_at')
                ->limit($limit)
                ->get(['l.id', 'l.journal_entry_id', 'e.deleted_at', 'l.account_id', 'l.debit', 'l.credit'])
                ->map(fn ($r) => [
                    $r->id, $r->journal_entry_id, $r->deleted_at, $r->account_id,
                    (string) $r->debit, (string) $r->credit,
                ])->all());
        }
        $this->line("  <info>{$orphaned}</info>");
        $this->newLine();

        // 3. Entries that do not balance. Compared as strings: these are
        //    decimal(15,2), so a float comparison can invent a difference
        //    that is not in the data.
        $unbalanced = DB::table('journal_entries as e')
            ->join('journal_entry_lines as l', 'l.journal_entry_id', '=', 'e.id')
            ->whereNull('e.deleted_at')
            ->groupBy('e.id', 'e.transaction_no', 'e.transaction_date')
            ->havingRaw('CAST(SUM(l.debit) AS DECIMAL(18,2)) <> CAST(SUM(l.credit) AS DECIMAL(18,2))')
            ->get([
                'e.id', 'e.transaction_no', 'e.transaction_date',
                DB::raw('CAST(SUM(l.debit) AS DECIMAL(18,2)) as debit_total'),
                DB::raw('CAST(SUM(l.credit) AS DECIMAL(18,2)) as credit_total'),
            ]);
        $this->line('unbalanced entries (live)');
        if ($unbalanced->isNotEmpty()) {
            $problems++;
            $this->table(['id', 'transaction_no', 'transaction_date', 'debit_total', 'credit_total'], $unbalanced->take($limit)->map(fn ($r) => [
                $r->id, $r->transaction_no, $r->transaction_date,
                (string) $r->debit_total, (string) $r->credit_total,
            ])->all());
        }
        $this->line('  <info>'.$unbalanced->count().'</info>');
        $this->newLine();

        // 4. More than one entry per disbursement - what ledger:reconcile prunes.
        //
        // The entry id list is gathered with a second query rather than a
        // GROUP_CONCAT/STRING_AGG in SQL: those are spelled differently on
        // Postgres and SQLite, and this command needs to run in tests too.
        $duplicateRefs = DB::table('journal_entry_lines as l')
            ->whereIn('l.reference_type', ['disbursement', 'Disbursement', 'Disbursements'])
            ->groupBy('l.reference_id')
            ->havingRaw('COUNT(DISTINCT l.journal_entry_id) > 1')
            ->pluck('l.reference_id');

        $duplicateCount = $duplicateRefs->count();

        $this->line('disbursements with duplicate postings');
        if ($duplicateCount > 0) {
            $problems++;
            $rows = [];
            foreach ($duplicateRefs->take($limit) as $refId) {
                $ids = DB::table('journal_entry_lines')
                    ->where('reference_type', 'Disbursement')
                    ->where('reference_id', $refId)
                    ->distinct()
                    ->orderBy('journal_entry_id')
                    ->pluck('journal_entry_id')
                    ->all();
                $rows[] = [$refId, count($ids), implode(',', $ids)];
            }
            $this->table(['disbursement_id', 'entry_count', 'entry_ids (lowest is kept)'], $rows);
        }
        $this->line('  <info>'.$duplicateCount.'</info>');
        $this->newLine();

        // 5. Lines whose reference points at a master record that no longer
        //    resolves. These are exactly the "orphaned posted journal lines"
        //    that show up in an audit: the GL posting is fine — balanced,
        //    posted, with its debit and credit sane — but the source document
        //    it references (expense, collection, tax obligation) is gone, so
        //    nobody can navigate to it. journal_entry_lines has no FK on
        //    (reference_type, reference_id), which is how they come to exist
        //    (PermanentDeleteController guards new deletions but cannot undo
        //    the ones already done).
        //    Report-only: deleting a line here also deletes the last record
        //    of a posting that happened. That is an accounting decision, not
        //    a command flag.
        $masterRefs = [
            'Expenses' => 'expenses',
            'Accounts Receivable' => 'accounts_receivable',
            'Accounts Payable' => 'accounts_payable',
            'Disbursement' => 'disbursements',
            'Disbursements' => 'disbursements',
            'Tax Obligations' => 'tax_obligations',
            'Collections' => 'collections',
        ];

        $missingMaster = 0;
        $softDeletedMaster = 0;
        $masterRows = [];
        foreach ($masterRefs as $refType => $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $hard = DB::table('journal_entry_lines as l')
                ->where('l.reference_type', $refType)
                ->whereNotExists(function ($q) use ($table) {
                    $q->select(DB::raw(1))->from($table)->whereColumn($table.'.id', 'l.reference_id');
                });

            $soft = DB::table('journal_entry_lines as l')
                ->where('l.reference_type', $refType)
                ->whereExists(function ($q) use ($table) {
                    $q->select(DB::raw(1))
                        ->from($table)
                        ->whereColumn($table.'.id', 'l.reference_id')
                        ->whereNotNull($table.'.deleted_at');
                });

            $missingMaster += $hard->count();
            $softDeletedMaster += $soft->count();

            foreach ($hard->limit($limit)->get(['l.id', 'l.journal_entry_id', 'l.account_id', 'l.debit', 'l.credit', 'l.reference_id']) as $r) {
                $masterRows[] = [$r->id, $r->journal_entry_id, $r->reference_id, $refType, $r->account_id, (string) $r->debit, (string) $r->credit, 'missing'];
            }
            foreach ($soft->limit($limit)->get(['l.id', 'l.journal_entry_id', 'l.account_id', 'l.debit', 'l.credit', 'l.reference_id']) as $r) {
                $masterRows[] = [$r->id, $r->journal_entry_id, $r->reference_id, $refType, $r->account_id, (string) $r->debit, (string) $r->credit, 'soft-deleted'];
            }
        }

        $this->line('lines referencing a missing/soft-deleted master record');
        $masterTotal = $missingMaster + $softDeletedMaster;
        if ($masterTotal > 0) {
            $problems++;
            $this->table(
                ['line_id', 'journal_entry_id', 'reference_id', 'reference_type', 'account_id', 'debit', 'credit', 'master'],
                $masterRows
            );
        }
        $this->line('  <info>'.$masterTotal.'</info> (hard-missing: '.$missingMaster.', soft-deleted: '.$softDeletedMaster.')');
        $this->newLine();

        // 6. Legacy lowercase reference_type still in the table.
        $legacy = DB::table('journal_entry_lines')
            ->where('reference_type', 'disbursement')
            ->count();
        $this->line('legacy lowercase reference_type lines');
        if ($legacy > 0) {
            $problems++;
        }
        $this->line("  <info>{$legacy}</info>");
        $this->newLine();

        if ($problems === 0) {
            $this->info('Ledger integrity: no problems found.');

            return self::SUCCESS;
        }

        $this->warn("Ledger integrity: {$problems} categor".($problems === 1 ? 'y needs' : 'ies need').' attention.');
        $this->newLine();
        $this->comment('Duplicate postings are repaired by: php artisan ledger:reconcile --apply');
        $this->comment('Dangling and orphaned lines need a review before deleting — they are the only record of a posting that happened.');

        return self::SUCCESS;
    }
}
