<?php

namespace Database\Seeders;

use App\Models\AccountsReceivable;
use App\Models\CashAccount;
use App\Models\Collection as CollectionModel;
use App\Models\Collector;
use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Seeds confirmed collections across 6 months (April - September 2026) corresponding to AR invoices.
 *
 * CRITICAL FOR DEFENSE & ARIMA FORECASTING:
 * PythonArimaForecastEngine explicitly queries:
 *   DB::table('collections')->where('status', 'Confirmed')->whereBetween('collection_date', ...)
 *
 * Setting status => 'Confirmed' and generating 4-5 payments per month ensures healthy,
 * realistic, non-zero historical monthly revenue curves that yield high-confidence ARIMA models.
 */
class CollectionSeeder extends Seeder
{
    public function run(): void
    {
        $invoices = AccountsReceivable::where('paid_amount', '>', 0)->orderBy('invoice_date')->get();
        $collectors = Collector::all();
        $cashAccounts = CashAccount::where('status', 'Active')->get();
        $user = User::query()->value('id');

        $missing = collect([
            'accounts_receivable (with paid_amount > 0)' => $invoices->isEmpty(),
            'collectors' => $collectors->isEmpty(),
            'cash_accounts' => $cashAccounts->isEmpty(),
            'users' => ! $user,
        ])->filter()->keys();

        if ($missing->isNotEmpty()) {
            throw new RuntimeException(
                'CollectionSeeder needs existing rows in: ' . $missing->implode(', ') . '. Seed those first.'
            );
        }

        $collectorCount = $collectors->count();
        $accountCount = $cashAccounts->count();

        // 20 confirmed collections distributed across April to September 2026
        // perfectly aligning with the AR invoices where paid_amount > 0
        $collectionRecords = [];

        foreach ($invoices as $idx => $inv) {
            $collector = $collectors[$idx % $collectorCount];
            $cashAccount = $cashAccounts[$idx % $accountCount];

            // Collection date shortly after invoice date (e.g., 5 to 20 days after)
            $invDate = \Carbon\Carbon::parse($inv->invoice_date);
            $collDate = $invDate->copy()->addDays(random_int(5, 20));

            // Do not exceed current date (Sep 28, 2026)
            if ($collDate->isFuture()) {
                $collDate = \Carbon\Carbon::parse('2026-09-26');
            }

            $dateStr = $collDate->toDateString();
            $receiptNum = sprintf('OR-2026-%04d', $idx + 1);

            $collectionRecords[] = [
                'receipt_number' => $receiptNum,
                'ar_id' => $inv->id,
                'collector_id' => $collector->id,
                'cash_account_id' => $cashAccount->id,
                'or_number' => sprintf('OR-%05d', 80100 + $idx),
                'collection_date' => $dateStr,
                'deposit_date' => $dateStr,
                'amount_received' => $inv->paid_amount,
                'payment_method' => $inv->payment_method,
                'reference_number' => sprintf('REF-COLL-%05d', 50000 + $idx),
                'status' => 'Confirmed',
                'received_by' => $user,
                'remarks' => "Official receipt issued for invoice {$inv->invoice_number} ({$inv->remarks})",
                'created_by' => $user,
            ];
        }

        foreach ($collectionRecords as $record) {
            CollectionModel::updateOrCreate(
                ['receipt_number' => $record['receipt_number']],
                $record
            );
        }

        $this->command?->info('Seeded ' . count($collectionRecords) . ' confirmed collections across 6 months.');
    }
}