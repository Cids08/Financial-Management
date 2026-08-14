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
            ->when($filters['reference_type'] ?? null, fn ($q, $type) => $q->where('reference_type', $type))
            ->when($filters['account_id'] ?? null, fn ($q, $id) => $q->where('account_id', $id))
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

        return $query
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->orderBy('journal_entries.transaction_date')
            ->orderBy('journal_entry_lines.id')
            ->select('journal_entry_lines.*')
            ->paginate($filters['per_page'] ?? 25);
    }

    /** All lines belonging to the same journal entry — powers the detail modal. */
    public function getEntryWithLines(int $journalEntryId): JournalEntry
    {
        return JournalEntry::with(['lines.account:id,account_code,account_name'])
            ->findOrFail($journalEntryId);
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
            ->when($filters['reference_type'] ?? null, fn ($q, $type) => $q->where('journal_entry_lines.reference_type', $type))
            ->when($filters['account_id'] ?? null, fn ($q, $id) => $q->where('journal_entry_lines.account_id', $id))
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

    /** Active accounts for the filter dropdown, cheapest columns only. */
    public function getActiveAccounts(): Collection
    {
        return ChartOfAccount::active()
            ->orderBy('account_code')
            ->get(['id', 'account_code', 'account_name', 'account_type']);
    }
}