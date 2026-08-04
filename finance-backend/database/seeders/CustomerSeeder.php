<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $customers = [
            ['customer_name' => 'Delacruz Trading', 'contact_person' => 'Juan Delacruz', 'contact_number' => '0917 234 5678', 'email' => 'accounts@delacruztrading.com', 'address' => 'Quezon City, Metro Manila', 'tin' => '123-456-789-000', 'credit_limit' => 250000, 'status' => 'Active'],
            ['customer_name' => 'Meridian Retail Corp.', 'contact_person' => 'Liza Ramos', 'contact_number' => '0918 555 2211', 'email' => 'ap@meridianretail.com', 'address' => 'Makati City, Metro Manila', 'tin' => '234-567-890-000', 'credit_limit' => 500000, 'status' => 'Active'],
            ['customer_name' => 'Northgate Traders', 'contact_person' => 'Miguel Santos', 'contact_number' => '0920 112 3344', 'email' => 'finance@northgate.ph', 'address' => 'Cebu City, Cebu', 'tin' => '345-678-901-000', 'credit_limit' => 150000, 'status' => 'Active'],
            ['customer_name' => 'Bayview Logistics', 'contact_person' => 'Carla Uy', 'contact_number' => '0921 987 6543', 'email' => 'billing@bayviewlog.com', 'address' => 'Davao City, Davao del Sur', 'tin' => '456-789-012-000', 'credit_limit' => 100000, 'status' => 'Inactive'],
            ['customer_name' => 'Sierra Hardware Supply', 'contact_person' => 'Tomas Cruz', 'contact_number' => '0917 444 0099', 'email' => 'sierra.hw@gmail.com', 'address' => 'Baguio City, Benguet', 'tin' => '567-890-123-000', 'credit_limit' => 75000, 'status' => 'Active', 'archived' => true],
        ];

        foreach ($customers as $data) {
            $archived = $data['archived'] ?? false;
            unset($data['archived']);

            $customer = Customer::create($data);

            if ($archived) {
                $customer->delete(); // soft delete, matches the "Archived" row from the original mock data
            }
        }
    }
}