<?php

namespace Database\Seeders;

use App\Models\ServiceArea;
use Illuminate\Database\Seeder;

class ServiceAreaSeeder extends Seeder
{
    public function run(): void
    {
        $areas = [
            ['name' => 'Quezon City', 'code' => 'QC'],
            ['name' => 'Manila', 'code' => 'MNL'],
            ['name' => 'Makati', 'code' => 'MKT'],
            ['name' => 'Pasig', 'code' => 'PSG'],
            ['name' => 'Caloocan', 'code' => 'CLC'],
            ['name' => 'Marikina', 'code' => 'MRK'],
            ['name' => 'Taguig', 'code' => 'TGG'],
        ];

        foreach ($areas as $area) {
            // updateOrCreate on the unique `code` — safe to re-run.
            ServiceArea::updateOrCreate(['code' => $area['code']], $area);
        }

        $this->command?->info('Seeded ' . count($areas) . ' service areas.');
    }
}