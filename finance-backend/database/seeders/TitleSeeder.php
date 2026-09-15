<?php

namespace Database\Seeders;

use App\Models\Title;
use Illuminate\Database\Seeder;

class TitleSeeder extends Seeder
{
    public function run(): void
    {
        $titles = [
            'Accounting Staff',
            'Finance Manager',
            'CEO',
            'Collector',
        ];

        foreach ($titles as $name) {
            Title::updateOrCreate(
                ['name' => $name],
                ['is_active' => true]
            );
        }
    }
}