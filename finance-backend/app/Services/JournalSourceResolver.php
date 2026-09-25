<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AccountsReceivable;
use App\Models\Budget;
use App\Models\Collection as ReceiptCollection;
use App\Models\Disbursement;
use App\Models\Expense;
use App\Models\FixedAsset;
use App\Models\TaxObligation;
use Illuminate\Support\Collection;

/**
 * Attaches "where did this journal line come from" provenance to every posted
 * line in the General Ledger. A journal line carries reference_type/
 * reference_id pointing at the source record (invoice, voucher, receipt, ...);
 * this resolver batch-loads those records and extracts the counterparty name
 * (customer / supplier / payee / budget) plus the source document number, so
 * the ledger shows real detail instead of just a module badge.
 *
 * All lookups run per-group in a single WHERE IN query each page, so the
 * paginated journal never triggers per-row N+1 queries.
 */
class JournalSourceResolver
{
    private const LABELS = [
        'accounts_receivable' => 'Accounts Receivable',
        'accounts_payable' => 'Accounts Payable',
        'collection' => 'Collection',
        'disbursement' => 'Disbursement',
        'expense' => 'Expense',
        'budget' => 'Budget',
        'tax_obligation' => 'Tax Obligation',
        'fixed_asset' => 'Fixed Asset Depreciation',
    ];

    /**
     * @param  Collection<int, \App\Models\JournalEntryLine>  $lines
     * @return array<int, array{label: string, name: string, reference: string}>
     */
    public static function resolve(Collection $lines): array
    {
        $grouped = [];   // group => refId => lineId[]
        $pending = [];   // lineId => [group, refId]

        foreach ($lines as $line) {
            if (! $line->reference_id) {
                continue;
            }
            $key = self::groupKey($line->reference_type);
            if ($key === null) {
                continue;
            }
            // A journal entry has TWO lines per source document (the debit and
            // the credit leg), so a reference maps to every line in its pair.
            $grouped[$key][(int) $line->reference_id][] = $line->id;
            $pending[$line->id] = [$key, (int) $line->reference_id];
        }

        $store = [];
        foreach ($grouped as $key => $lineIdsByRef) {
            foreach (self::fetch($key, array_keys($lineIdsByRef)) as $refId => $info) {
                foreach ($lineIdsByRef[$refId] ?? [] as $lineId) {
                    if (! isset($store[$lineId])) {
                        $store[$lineId] = $info;
                    }
                }
            }
        }

        // Lines whose source record no longer exists still get a coherent label.
        foreach ($pending as $lineId => [$key, $_refId]) {
            $store[$lineId] ??= [
                'label' => self::LABELS[$key],
                'name' => '',
                'reference' => '',
            ];
        }

        return $store;
    }

    private static function groupKey(?string $referenceType): ?string
    {
        if ($referenceType === null || $referenceType === '') {
            return null;
        }

        $clean = strtolower((string) preg_replace('/[^a-zA-Z]/', '', $referenceType));

        return match ($clean) {
            'accountsreceivable', 'accountsreceivables', 'receivable', 'receivables', 'ar' => 'accounts_receivable',
            'accountspayable', 'accountspayables', 'payable', 'payables', 'ap' => 'accounts_payable',
            'disbursement', 'disbursements', 'dv' => 'disbursement',
            'expense', 'expenses' => 'expense',
            'collection', 'collections' => 'collection',
            'budget', 'budgets' => 'budget',
            'taxobligation', 'taxobligations', 'tax' => 'tax_obligation',
            'fixedasset', 'fixedassetdepreciation', 'depreciation' => 'fixed_asset',
            default => null,
        };
    }

    /**
     * @return array<int, array{label: string, name: string, reference: string}>
     */
    private static function fetch(string $key, array $ids): array
    {
        return match ($key) {
            'accounts_receivable' => AccountsReceivable::query()
                ->whereIn('id', $ids)
                ->with('customer:id,customer_name')
                ->get(['id', 'customer_id', 'invoice_number'])
                ->mapWithKeys(fn ($r) => [$r->id => [
                    'label' => self::LABELS[$key],
                    'name' => optional($r->customer)->customer_name ?? '',
                    'reference' => (string) ($r->invoice_number ?? ''),
                ]])->all(),

            'accounts_payable' => AccountsPayable::query()
                ->whereIn('id', $ids)
                ->with('supplier:id,supplier_name')
                ->get(['id', 'supplier_id', 'invoice_number'])
                ->mapWithKeys(fn ($r) => [$r->id => [
                    'label' => self::LABELS[$key],
                    'name' => optional($r->supplier)->supplier_name ?? '',
                    'reference' => (string) ($r->invoice_number ?? ''),
                ]])->all(),

            'collection' => ReceiptCollection::query()
                ->whereIn('id', $ids)
                ->with('accountsReceivable.customer:id,customer_name')
                ->get(['id', 'ar_id', 'receipt_number', 'or_number'])
                ->mapWithKeys(fn ($r) => [$r->id => [
                    'label' => self::LABELS[$key],
                    'name' => optional($r->accountsReceivable?->customer)->customer_name ?? '',
                    'reference' => (string) ($r->receipt_number ?? $r->or_number ?? ''),
                ]])->all(),

            'disbursement' => Disbursement::query()
                ->whereIn('id', $ids)
                ->get(['id', 'payee', 'voucher_number'])
                ->mapWithKeys(fn ($r) => [$r->id => [
                    'label' => self::LABELS[$key],
                    'name' => (string) ($r->payee ?? ''),
                    'reference' => (string) ($r->voucher_number ?? ''),
                ]])->all(),

            'expense' => Expense::query()
                ->whereIn('id', $ids)
                ->with('supplier:id,supplier_name')
                ->get(['id', 'supplier_id', 'description', 'receipt_number'])
                ->mapWithKeys(fn ($r) => [$r->id => [
                    'label' => self::LABELS[$key],
                    'name' => $r->supplier?->supplier_name ?? (string) mb_substr((string) $r->description, 0, 60),
                    'reference' => (string) ($r->receipt_number ?? ''),
                ]])->all(),

            'budget' => Budget::query()
                ->whereIn('id', $ids)
                ->get(['id', 'budget_code', 'budget_name'])
                ->mapWithKeys(fn ($r) => [$r->id => [
                    'label' => self::LABELS[$key],
                    'name' => (string) ($r->budget_name ?? ''),
                    'reference' => (string) ($r->budget_code ?? ''),
                ]])->all(),

            'tax_obligation' => TaxObligation::query()
                ->whereIn('id', $ids)
                ->get(['id', 'tax_type', 'tax_period', 'reference_number'])
                ->mapWithKeys(fn ($r) => [$r->id => [
                    'label' => self::LABELS[$key],
                    'name' => trim(($r->tax_type ?? '').' · '.($r->tax_period ?? ''), " \u{00B7}"),
                    'reference' => (string) ($r->reference_number ?? ''),
                ]])->all(),

            'fixed_asset' => FixedAsset::query()
                ->whereIn('id', $ids)
                ->get(['id', 'asset_code', 'asset_name'])
                ->mapWithKeys(fn ($r) => [$r->id => [
                    'label' => self::LABELS[$key],
                    'name' => (string) ($r->asset_name ?? ''),
                    'reference' => (string) ($r->asset_code ?? ''),
                ]])->all(),

            default => [],
        };
    }
}