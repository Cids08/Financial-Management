<?php

namespace Database\Seeders;

use App\Models\Collector;
use App\Models\ServiceArea;
use Illuminate\Database\Seeder;

class CollectorSeeder extends Seeder
{
    public function run(): void
    {
        $serviceAreas = ServiceArea::all();

        if ($serviceAreas->isEmpty()) {
            $this->command?->warn('No service areas found — run ServiceAreaSeeder first. Collectors will be seeded with service_area_id = null.');
        }

        $collectors = [
            ['employee_no' => 'EMP-0101', 'first_name' => 'Ramon', 'last_name' => 'Torres', 'area' => 'QC'],
            ['employee_no' => 'EMP-0102', 'first_name' => 'Liza', 'last_name' => 'Fernandez', 'area' => 'MNL'],
            ['employee_no' => 'EMP-0103', 'first_name' => 'Marco', 'last_name' => 'Santos', 'area' => 'MKT'],
            ['employee_no' => 'EMP-0104', 'first_name' => 'Ana', 'last_name' => 'Reyes', 'area' => 'PSG'],
            ['employee_no' => 'EMP-0105', 'first_name' => 'Jun', 'last_name' => 'Bautista', 'area' => 'CLC'],
            ['employee_no' => 'EMP-0106', 'first_name' => 'Grace', 'last_name' => 'Villanueva', 'area' => 'MRK'],
            ['employee_no' => 'EMP-0107', 'first_name' => 'Paolo', 'last_name' => 'Cruz', 'area' => 'TGG'],
            ['employee_no' => 'EMP-0108', 'first_name' => 'Divina', 'last_name' => 'Aquino', 'area' => 'QC'],
        ];

        foreach ($collectors as $c) {
            $serviceArea = $serviceAreas->firstWhere('code', $c['area']);

            Collector::updateOrCreate(
                ['employee_no' => $c['employee_no']],
                [
                    'first_name' => $c['first_name'],
                    'last_name' => $c['last_name'],
                    'middle_name' => null,
                    'phone_number' => fake()->numerify('09## ### ####'),
                    'email' => strtolower($c['first_name'] . '.' . $c['last_name']) . '@alibaton.test',
                    'profile_photo' => null,
                    'assigned_area' => $serviceArea?->name,
                    'service_area_id' => $serviceArea?->id,
                    'commission_rate' => fake()->randomFloat(2, 1.5, 4.0),
                    'monthly_target' => fake()->randomFloat(2, 150000, 350000),
                    'status' => fake()->boolean(85) ? 'Active' : 'Inactive',
                ]
            );
        }

        $this->command?->info('Seeded ' . count($collectors) . ' collectors.');
    }
}