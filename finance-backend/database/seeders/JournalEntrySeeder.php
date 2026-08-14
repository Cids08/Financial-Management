<?php

namespace Database\Seeders;

use App\Models\ChartOfAccount;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class JournalEntrySeeder extends Seeder
{
    /** account_code => id, resolved once and reused for every line below. */
    private array $accountIds = [];

    public function run(): void
    {
        $createdBy = User::query()->value('id');

        if (! $createdBy) {
            throw new RuntimeException(
                'JournalEntrySeeder needs at least one user to exist first. Run your UserSeeder before this one.'
            );
        }

        $this->accountIds = ChartOfAccount::pluck('id', 'account_code')->all();

        // Each entry: [transaction_no, date, description, [ [account_code, debit, credit], ... ], reference_type, reference_id]
        $entries = [
            [
                'JE-2026-0001', '2026-07-15', 'OR-10021 — Delacruz Trading collection',
                [['1012', 60000, 0], ['1100', 0, 60000]],
                'Collections', 1,
            ],
            [
                'JE-2026-0002', '2026-07-20', 'OR-10022 — Meridian Retail Corp. collection',
                [['1010', 49000, 0], ['1100', 0, 49000]],
                'Collections', 2,
            ],
            [
                'JE-2026-0003', '2026-07-18', 'Payment to Northgate Supplies Inc.',
                [['2000', 84500, 0], ['1010', 0, 84500]],
                'Disbursements', 1,
            ],
            [
                'JE-2026-0004', '2026-07-15', 'Collector commission — Ramon Torres',
                [['5200', 1500, 0], ['1000', 0, 1500]],
                'Expenses', 1,
            ],
            [
                'JE-2026-0005', '2026-07-18', 'BIR VAT payment — June 2026 (BIR-VAT-0620)',
                [['5300', 84500, 0], ['1010', 0, 84500]],
                'Tax Obligations', 101,
            ],
        ];

        DB::transaction(function () use ($entries, $createdBy) {
            foreach ($entries as [$transactionNo, $date, $description, $lines, $referenceType, $referenceId]) {
                $this->postEntry($transactionNo, $date, $description, $lines, $referenceType, $referenceId, $createdBy);
            }
        });
    }

    private function postEntry(
        string $transactionNo,
        string $date,
        string $description,
        array $lines,
        string $referenceType,
        int $referenceId,
        int $createdBy
    ): void {
        $debitTotal = array_sum(array_column($lines, 1));
        $creditTotal = array_sum(array_column($lines, 2));

        if (abs($debitTotal - $creditTotal) > 0.005) {
            throw new RuntimeException("Seed entry {$transactionNo} does not balance: debit {$debitTotal} vs credit {$creditTotal}.");
        }

        $entry = JournalEntry::updateOrCreate(
            ['transaction_no' => $transactionNo],
            [
                'transaction_date' => $date,
                'description' => $description,
                'status' => 'Posted',
                'posted_by' => $createdBy,
                'posted_at' => $date,
                'created_by' => $createdBy,
            ]
        );

        // Re-seeding is idempotent: drop and re-insert this entry's lines
        // rather than accumulating duplicates on repeated `db:seed` runs.
        $entry->lines()->delete();

        foreach ($lines as [$accountCode, $debit, $credit]) {
            if (! isset($this->accountIds[$accountCode])) {
                throw new RuntimeException("Unknown account_code '{$accountCode}' — run ChartOfAccountSeeder first.");
            }

            $entry->lines()->create([
                'account_id' => $this->accountIds[$accountCode],
                'debit' => $debit,
                'credit' => $credit,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
            ]);
        }
    }
}