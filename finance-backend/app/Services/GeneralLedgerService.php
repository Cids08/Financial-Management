<?php

namespace App\Services;

use App\Models\ChartOfAccount;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class GeneralLedgerService
{
    /**
     * Filtered, paginated journal lines with their parent entry + account
     * eager-loaded, so the frontend's flat journal table gets everything
     * (date, description, account label, reference badge) in one request.
     */
    public function getLines(array $filters): LengthAwarePaginator
    {
        $query = JournalEntryLine::query()
            ->with(['account:id,account_code,account_name', 'journalEntry:id,transaction_no,transaction_date,description,status'])
            ->whereHas('journalEntry', fn ($q) => $q->posted())
            ->when($filters['side'] ?? null, function ($q, $side) {
                $side === 'debit' ? $q->where('debit', '>', 0) : $q->where('credit', '>', 0);
            })
            ->when($filters['reference_type'] ?? null, function ($q, $type) {
                $q->where(function ($sub) use ($type) {
                    $singular = rtrim($type, 's');
                    $sub->where('reference_type', 'ilike', $type)
                        ->orWhere('reference_type', 'ilike', $singular)
                        ->orWhere('reference_type', 'ilike', $singular . 's');
                });
            })
            ->when($filters['account_id'] ?? null, fn ($q) => $q->whereIn('account_id', $this->expandedAccountIds((int) $filters['account_id'])))
            ->when($filters['date_from'] ?? null, fn ($q, $date) => $q->whereHas(
                'journalEntry', fn ($je) => $je->whereDate('transaction_date', '>=', $date)
            ))
            ->when($filters['date_to'] ?? null, fn ($q, $date) => $q->whereHas(
                'journalEntry', fn ($je) => $je->whereDate('transaction_date', '<=', $date)
            ))
            ->when($filters['search'] ?? null, function ($q, $search) {
                $q->where(function ($inner) use ($search) {
                    $inner->where('remarks', 'ilike', "%{$search}%")
                        ->orWhereHas('journalEntry', fn ($je) => $je->where('description', 'ilike', "%{$search}%"))
                        ->orWhereHas('account', fn ($a) => $a->where('account_name', 'ilike', "%{$search}%")
                            ->orWhere('account_code', 'ilike', "%{$search}%"));
                });
            });

        $page = $query
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->orderByDesc('journal_entries.transaction_date')
            ->orderByDesc('journal_entry_lines.id')
            ->select('journal_entry_lines.*')
            ->paginate($filters['per_page'] ?? 25);

        $this->attachSources($page->getCollection());

        return $page;
    }

    /** All lines belonging to the same journal entry — powers the detail modal. */
    public function getEntryWithLines(int $journalEntryId): JournalEntry
    {
        $entry = JournalEntry::with(['lines.account:id,account_code,account_name'])
            ->findOrFail($journalEntryId);

        $this->attachSources($entry->lines);

        return $entry;
    }

    /**
     * SAP B1-style account ledger: every posted line grouped by account,
     * ordered by posting date, with a running balance that starts from the
     * opening balance (postings before date_from). Same filters drive this
     * as the journal + trial balance views.
     *
     * Sub-accounts (parent_account_id) roll UP into their topmost parent —
     * a parent section aggregates its own postings plus every descendant's,
     * and each line still carries the real posting account so the frontend
     * can show which sub-account it belongs to.
     *
     * @return array{accounts: list<array>, totals: array<string,float>}
     */
    public function getAccountLedger(array $filters): array
    {
        $lines = $this->accountLedgerLines($filters);
        $opening = $this->openingBalanceByAccount($filters);

        $this->attachSources($lines);

        $rootMap = $this->accountRootMap();
        $rows = $this->chartRows();

        $accounts = [];
        $subAccountSets = []; // rootId => [accountId => true]
        foreach ($lines as $line) {
            $realId = (int) $line->account_id;
            $rootId = $rootMap[$realId] ?? $realId;

            if (! isset($accounts[$rootId])) {
                $rootRow = $rows[$rootId] ?? null;
                $accounts[$rootId] = [
                    'account_id' => $rootId,
                    'account_code' => $rootRow?->account_code ?? $line->account?->account_code,
                    'account_name' => $rootRow?->account_name ?? $line->account?->account_name,
                    'opening_balance' => 0.0,
                    'lines' => [],
                    'total_debit' => 0.0,
                    'total_credit' => 0.0,
                    'balance' => 0.0,
                    'sub_accounts' => [],
                ];
            }

            $debit = (float) $line->debit;
            $credit = (float) $line->credit;
            $running = ($accounts[$rootId]['lines'][count($accounts[$rootId]['lines']) - 1]['running_balance'] ?? $accounts[$rootId]['opening_balance']) + $debit - $credit;

            $accounts[$rootId]['lines'][] = [
                'id' => $line->id,
                'journal_entry_id' => $line->journal_entry_id,
                'transaction_date' => $line->journalEntry?->transaction_date?->format('Y-m-d'),
                'transaction_no' => $line->journalEntry?->transaction_no,
                'description' => $line->journalEntry?->description,
                'remarks' => $line->remarks,
                'reference_type' => $line->reference_type,
                'source' => [
                    'label' => $line->source_info['label'] ?? '',
                    'name' => $line->source_info['name'] ?? '',
                    'reference' => $line->source_info['reference'] ?? '',
                    'reference_type' => $line->reference_type,
                    'reference_id' => $line->reference_id,
                ],
                'account' => [
                    'id' => $realId,
                    'code' => $line->account?->account_code,
                    'name' => $line->account?->account_name,
                ],
                'debit' => $debit,
                'credit' => $credit,
                'running_balance' => $running,
            ];

            if ($realId !== $rootId) {
                $subAccountSets[$rootId][$realId] = true;
            }

            $accounts[$rootId]['total_debit'] += $debit;
            $accounts[$rootId]['total_credit'] += $credit;
            $accounts[$rootId]['balance'] = $running;
        }

        // Opening balance per section = sum of every member account's opening
        // (SAP-style: the parent starts from the combined carry-over of the
        // whole group). Balance is re-derived so children always reconcile.
        $members = $this->rootMembers($rootMap);
        foreach ($accounts as $rootId => &$account) {
            $aggregate = 0.0;
            foreach ($members[$rootId] ?? [$rootId] as $memberId) {
                $aggregate += $opening[$memberId] ?? 0;
            }
            $account['opening_balance'] = $aggregate;
            $account['balance'] = $aggregate + $account['total_debit'] - $account['total_credit'];
        }
        unset($account);

        foreach ($accounts as &$account) {
            $account['sub_accounts'] = array_values(array_map(
                fn ($id) => [
                    'id' => (int) $id,
                    'code' => $rows[$id]?->account_code ?? '',
                    'name' => $rows[$id]?->account_name ?? '',
                ],
                array_keys($subAccountSets[$account['account_id']] ?? [])
            ));
            usort($account['sub_accounts'], fn ($a, $b) => strcmp((string) $a['code'], (string) $b['code']));
        }
        unset($account);

        $accounts = array_values($accounts);
        usort($accounts, fn ($a, $b) => strcmp((string) $a['account_code'], (string) $b['account_code']));

        $totals = [
            'debit' => array_sum(array_column($accounts, 'total_debit')),
            'credit' => array_sum(array_column($accounts, 'total_credit')),
            'balance' => array_sum(array_column($accounts, 'balance')),
        ];

        return compact('accounts', 'totals');
    }

    /** Postings inside the current filter range, ordered by account then date. */
    private function accountLedgerLines(array $filters)
    {
        return JournalEntryLine::query()
            ->with(['account:id,account_code,account_name', 'journalEntry:id,transaction_no,transaction_date,description,status'])
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->join('chart_of_accounts', 'chart_of_accounts.id', '=', 'journal_entry_lines.account_id')
            ->where('journal_entries.status', 'Posted')
            ->when($filters['side'] ?? null, function ($q, $side) {
                $side === 'debit' ? $q->where('journal_entry_lines.debit', '>', 0) : $q->where('journal_entry_lines.credit', '>', 0);
            })
            ->when($filters['reference_type'] ?? null, function ($q, $type) {
                $q->where(function ($sub) use ($type) {
                    $singular = rtrim($type, 's');
                    $sub->where('journal_entry_lines.reference_type', 'ilike', $type)
                        ->orWhere('journal_entry_lines.reference_type', 'ilike', $singular)
                        ->orWhere('journal_entry_lines.reference_type', 'ilike', $singular . 's');
                });
            })
            ->when($filters['account_id'] ?? null, fn ($q) => $q->whereIn('journal_entry_lines.account_id', $this->expandedAccountIds((int) $filters['account_id'])))
            ->when($filters['date_from'] ?? null, fn ($q, $date) => $q->whereDate('journal_entries.transaction_date', '>=', $date))
            ->when($filters['date_to'] ?? null, fn ($q, $date) => $q->whereDate('journal_entries.transaction_date', '<=', $date))
            ->when($filters['search'] ?? null, function ($q, $search) {
                $q->where(function ($inner) use ($search) {
                    $inner->where('journal_entry_lines.remarks', 'ilike', "%{$search}%")
                        ->orWhere('journal_entries.description', 'ilike', "%{$search}%")
                        ->orWhere('chart_of_accounts.account_name', 'ilike', "%{$search}%")
                        ->orWhere('chart_of_accounts.account_code', 'ilike', "%{$search}%");
                });
            })
            ->orderBy('journal_entries.transaction_date')
            ->orderBy('chart_of_accounts.account_code')
            ->orderBy('journal_entry_lines.id')
            ->select('journal_entry_lines.*')
            ->get();
    }

    /**
     * Opening balance per account = SUM(debits - credits) over posted lines
     * strictly before date_from (SAP B1 starts each account from the balance
     * carried over from earlier periods). No date range / side filters apply,
     * but the account + source filters do.
     *
     * @return array<int, float>
     */
    private function openingBalanceByAccount(array $filters): array
    {
        if (empty($filters['date_from'])) {
            return [];
        }

        return JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.status', 'Posted')
            ->when($filters['reference_type'] ?? null, function ($q, $type) {
                $q->where(function ($sub) use ($type) {
                    $singular = rtrim($type, 's');
                    $sub->where('journal_entry_lines.reference_type', 'ilike', $type)
                        ->orWhere('journal_entry_lines.reference_type', 'ilike', $singular)
                        ->orWhere('journal_entry_lines.reference_type', 'ilike', $singular . 's');
                });
            })
            ->when($filters['account_id'] ?? null, fn ($q) => $q->whereIn('journal_entry_lines.account_id', $this->expandedAccountIds((int) $filters['account_id'])))
            ->when($filters['date_from'] ?? null, fn ($q, $date) => $q->whereDate('journal_entries.transaction_date', '<', $date))
            ->selectRaw('journal_entry_lines.account_id as account_id, SUM(journal_entry_lines.debit - journal_entry_lines.credit) as balance')
            ->groupBy('journal_entry_lines.account_id')
            ->pluck('balance', 'account_id')
            ->mapWithKeys(fn ($balance, $accountId) => [$accountId => (float) $balance])
            ->all();
    }

    /**
     * Stamp "source" provenance (counterparty + document number) on a batch of
     * lines from JournalSourceResolver so the resource can expose real detail.
     */
    private function attachSources(Collection $lines): void
    {
        $sources = JournalSourceResolver::resolve($lines);

        foreach ($lines as $line) {
            $line->setAttribute('source_info', $sources[$line->id] ?? null);
        }
    }

    /**
     * One row per account: summed debit/credit and net balance, respecting
     * the same filters as the journal view so "Trial Balance" reflects
     * whatever the user has currently filtered down to.
     */
    public function getTrialBalance(array $filters): Collection
    {
        $query = JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->join('chart_of_accounts', 'chart_of_accounts.id', '=', 'journal_entry_lines.account_id')
            ->where('journal_entries.status', 'Posted')
            ->when($filters['reference_type'] ?? null, function ($q, $type) {
                $q->where(function ($sub) use ($type) {
                    $singular = rtrim($type, 's');
                    $sub->where('journal_entry_lines.reference_type', 'ilike', $type)
                        ->orWhere('journal_entry_lines.reference_type', 'ilike', $singular)
                        ->orWhere('journal_entry_lines.reference_type', 'ilike', $singular . 's');
                });
            })
            ->when($filters['account_id'] ?? null, fn ($q) => $q->whereIn('journal_entry_lines.account_id', $this->expandedAccountIds((int) $filters['account_id'])))
            ->when($filters['date_from'] ?? null, fn ($q, $date) => $q->whereDate('journal_entries.transaction_date', '>=', $date))
            ->when($filters['date_to'] ?? null, fn ($q, $date) => $q->whereDate('journal_entries.transaction_date', '<=', $date));

        return $query
            ->select(
                'chart_of_accounts.id as account_id',
                'chart_of_accounts.account_code',
                'chart_of_accounts.account_name',
                DB::raw('SUM(journal_entry_lines.debit) as total_debit'),
                DB::raw('SUM(journal_entry_lines.credit) as total_credit'),
            )
            ->groupBy('chart_of_accounts.id', 'chart_of_accounts.account_code', 'chart_of_accounts.account_name')
            ->orderBy('chart_of_accounts.account_code')
            ->get()
            ->map(function ($row) {
                $row->net_balance = $row->total_debit - $row->total_credit;
                return $row;
            });
    }

    /** Grand totals + balance check across *all* posted lines, unfiltered. */
    public function getGrandTotals(): array
    {
        $totals = JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.status', 'Posted')
            ->selectRaw('SUM(debit) as debit, SUM(credit) as credit')
            ->first();

        $debit = (float) ($totals->debit ?? 0);
        $credit = (float) ($totals->credit ?? 0);

        return [
            'debit' => $debit,
            'credit' => $credit,
            'difference' => $debit - $credit,
            'balanced' => abs($debit - $credit) < 0.005,
        ];
    }

    /** All chart accounts (id, code, name, parent), keyed by id, cached per request. */
    private array $chartRowsCache = [];

    private function chartRows(): array
    {
        if ($this->chartRowsCache === []) {
            $this->chartRowsCache = ChartOfAccount::query()
                ->select('id', 'account_code', 'account_name', 'parent_account_id')
                ->get()
                ->keyBy('id')
                ->all();
        }

        return $this->chartRowsCache;
    }

    /** account_id => topmost ancestor id (cycle-safe). */
    private function accountRootMap(): array
    {
        $rows = $this->chartRows();
        $map = [];

        foreach ($rows as $id => $row) {
            $seen = [];
            $node = $row;
            while ($node->parent_account_id && isset($rows[$node->parent_account_id]) && ! isset($seen[$node->parent_account_id])) {
                $seen[$node->parent_account_id] = true;
                $node = $rows[$node->parent_account_id];
            }
            $map[$id] = (int) $node->id;
        }

        return $map;
    }

    /** root id => every member account id underneath it (root + descendants). */
    private function rootMembers(array $rootMap): array
    {
        $members = [];
        foreach ($rootMap as $accountId => $rootId) {
            $members[$rootId][] = (int) $accountId;
        }

        return $members;
    }

    /** The selected account plus every descendant, for WHERE IN clauses. */
    private function expandedAccountIds(int $accountId): array
    {
        $rows = $this->chartRows();
        $children = [];
        foreach ($rows as $id => $row) {
            if ($row->parent_account_id) {
                $children[(int) $row->parent_account_id][] = (int) $id;
            }
        }

        $out = [$accountId];
        $queue = $children[$accountId] ?? [];
        while ($queue) {
            $id = array_shift($queue);
            $out[] = (int) $id;
            foreach ($children[$id] ?? [] as $child) {
                $queue[] = $child;
            }
        }

        return $out;
    }

    /**
     * Active accounts for the filter dropdown, cheapest columns only.
     */
    public function getActiveAccounts(): Collection
    {
        return ChartOfAccount::active()
            ->orderBy('account_code')
            ->get(['id', 'account_code', 'account_name', 'account_type']);
    }
}