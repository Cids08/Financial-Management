<?php

namespace Database\Seeders;

use App\Models\AccountsReceivable;
use App\Models\CashAccount;
use App\Models\Collection as CollectionModel; // aliased — see note in App\Models\Collection
use App\Models\Collector;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Seeds real collections rows spread across the last 6 months (so both
 * the 30-day Collections Trend chart AND the 6-month Revenue Trend chart
 * have real data, not just a single day's worth).
 *
 * Deliberately does NOT set `status` or touch the referenced AR's
 * remaining_balance — that's real business logic that belongs in
 * CollectionController::confirm(), not something a seeder should
 * approximate. This only exists to get real numbers into the charts;
 * it lets the DB's own default status value apply rather than guessing
 * an enum string against a CHECK constraint we haven't verified here.
 */
class CollectionSeeder extends Seeder
{
    public function run(): void
    {
        $receivables = AccountsReceivable::where('remaining_balance', '>', 0)->get();
        $collector = Collector::first();
        $cashAccount = CashAccount::where('status', 'Active')->first() ?? CashAccount::first();
        $user = User::query()->value('id');

        $missing = collect([
            'accounts_receivable (with remaining_balance > 0)' => $receivables->isEmpty(),
            'collectors' => ! $collector,
            'cash_accounts' => ! $cashAccount,
            'users' => ! $user,
        ])->filter()->keys();

        if ($missing->isNotEmpty()) {
            throw new RuntimeException(
                'CollectionSeeder needs existing rows in: ' . $missing->implode(', ') . '. Seed those first.'
            );
        }

        $today = Carbon::today();
        $count = 14;

        for ($i = 0; $i < $count; $i++) {
            // Spread across the last ~6 months, weighted toward more
            // recent dates so the 30-day chart isn't sparse.
            $daysAgo = $i < 8 ? random_int(0, 29) : random_int(30, 179);
            $date = $today->copy()->subDays($daysAgo);

            $ar = $receivables[$i % $receivables->count()];
            $amount = round(min((float) $ar->remaining_balance, random_int(5000, 80000)), 2);

            CollectionModel::updateOrCreate(
                ['receipt_number' => sprintf('OR-SEED-%03d', $i + 1)],
                [
                    'ar_id' => $ar->id,
                    'collector_id' => $collector->id,
                    'cash_account_id' => $cashAccount->id,
                    'or_number' => sprintf('OR-%05d', 90000 + $i),
                    'collection_date' => $date->toDateString(),
                    'deposit_date' => $date->toDateString(),
                    'amount_received' => $amount,
                    'payment_method' => ['Cash', 'Bank Transfer', 'Check'][array_rand(['Cash', 'Bank Transfer', 'Check'])],
                    'reference_number' => sprintf('REF-%06d', 100000 + $i),
                    'received_by' => $user,
                    'remarks' => 'Seed data for dashboard chart testing.',
                    'created_by' => $user,
                    // status: intentionally omitted — let the DB default apply.
                ]
            );
        }
    }
}