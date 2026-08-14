<?php

namespace Database\Seeders;

use App\Models\TaxObligation;
use App\Models\User;
use Illuminate\Database\Seeder;

class TaxObligationSeeder extends Seeder
{
    public function run(): void
    {
        // Falls back to the first user if the known super-admin seed
        // account isn't present in this environment — created_by is
        // NOT NULL on this table, so a valid id is required either way.
        $userId = User::query()->where('email', 'superadmin@alibaton.test')->value('id')
            ?? User::query()->value('id');

        if (! $userId) {
            $this->command?->warn('TaxObligationSeeder skipped — no users exist yet to set as created_by.');
            return;
        }

        // Each row's taxable_amount is back-derived from the original
        // mock's single "amount" field divided by that tax type's
        // default rate (see TAX_TYPE_CONFIG in TaxObligations.jsx), so
        // taxable_amount * (tax_rate / 100) reproduces the same figure
        // the mock displayed, now split into the ERD's real columns.
        $rows = [
            ['tax_type' => 'VAT',                    'tax_period' => '2026-06',   'due_date' => '2026-07-20', 'tax_rate' => 12.00, 'taxable_amount' => 704166.67, 'status' => 'Paid',    'payment_date' => '2026-07-18', 'reference_number' => 'BIR-VAT-0720', 'remarks' => 'Filed via eFPS', 'archived' => false],
            ['tax_type' => 'Withholding Tax',         'tax_period' => '2026-07',   'due_date' => '2026-08-10', 'tax_rate' => 2.00,  'taxable_amount' => 1637500.00, 'status' => 'Pending', 'payment_date' => null,        'reference_number' => null,           'remarks' => null,              'archived' => false],
            ['tax_type' => 'Income Tax',              'tax_period' => '2026-Q2',  'due_date' => '2026-08-15', 'tax_rate' => 25.00, 'taxable_amount' => 840000.00,  'status' => 'Pending', 'payment_date' => null,        'reference_number' => null,           'remarks' => 'Quarterly ITR',    'archived' => false],
            ['tax_type' => 'Percentage Tax',          'tax_period' => '2026-06',   'due_date' => '2026-07-20', 'tax_rate' => 3.00,  'taxable_amount' => 520000.00,  'status' => 'Pending', 'payment_date' => null,        'reference_number' => null,           'remarks' => 'Awaiting fund transfer', 'archived' => false],
            ['tax_type' => 'Local Business Tax',      'tax_period' => '2026-Q3',  'due_date' => '2026-07-20', 'tax_rate' => 2.00,  'taxable_amount' => 2400000.00, 'status' => 'Pending', 'payment_date' => null,        'reference_number' => null,           'remarks' => null,              'archived' => false],
            ['tax_type' => 'Documentary Stamp Tax',   'tax_period' => '2026-05',   'due_date' => '2026-06-05', 'tax_rate' => 1.50,  'taxable_amount' => 613333.33,  'status' => 'Paid',    'payment_date' => '2026-06-03', 'reference_number' => 'BIR-DST-0605', 'remarks' => null,              'archived' => true],
        ];

        foreach ($rows as $row) {
            $archived = $row['archived'];
            unset($row['archived']);

            $obligation = TaxObligation::create([
                ...$row,
                'tax_amount' => round($row['taxable_amount'] * ($row['tax_rate'] / 100), 2),
                'created_by' => $userId,
            ]);

            if ($archived) {
                $obligation->update(['deleted_by' => $userId]);
                $obligation->delete();
            }
        }
    }
}