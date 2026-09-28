<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $customers = [
            ['customer_name' => 'Delacruz Trading', 'contact_person' => 'Juan Delacruz', 'contact_number' => '0917 234 5678', 'email' => 'accounts@delacruztrading.com', 'address' => 'Quezon City, Metro Manila', 'tin' => '123-456-789-000', 'industry' => 'Commercial Construction', 'credit_limit' => 250000, 'payment_terms' => 'Net 30', 'contract_ref' => 'MSA-2026-DT-012', 'contract_expiry' => '2026-12-31', 'status' => 'Active'],
            ['customer_name' => 'Meridian Retail Corp.', 'contact_person' => 'Liza Ramos', 'contact_number' => '0918 555 2211', 'email' => 'ap@meridianretail.com', 'address' => 'Makati City, Metro Manila', 'tin' => '234-567-890-000', 'industry' => 'Industrial Warehousing', 'credit_limit' => 500000, 'payment_terms' => 'Net 45', 'contract_ref' => 'MSA-2025-MRC-091', 'contract_expiry' => '2027-01-31', 'status' => 'Active'],
            ['customer_name' => 'Northgate Traders', 'contact_person' => 'Miguel Santos', 'contact_number' => '0920 112 3344', 'email' => 'finance@northgate.ph', 'address' => 'Cebu City, Cebu', 'tin' => '345-678-901-000', 'industry' => 'Civil Engineering Infrastructure', 'credit_limit' => 150000, 'payment_terms' => 'Net 15', 'contract_ref' => 'MSA-2026-NT-004', 'contract_expiry' => '2026-09-30', 'status' => 'Active'],
            ['customer_name' => 'Bayview Logistics', 'contact_person' => 'Carla Uy', 'contact_number' => '0921 987 6543', 'email' => 'billing@bayviewlog.com', 'address' => 'Davao City, Davao del Sur', 'tin' => '456-789-012-000', 'industry' => 'Harbor & Port Cargo', 'credit_limit' => 100000, 'payment_terms' => 'Net 30', 'contract_ref' => 'MSA-2025-BL-019', 'contract_expiry' => '2026-11-30', 'status' => 'Inactive'],
            ['customer_name' => 'Sierra Hardware Supply', 'contact_person' => 'Tomas Cruz', 'contact_number' => '0917 444 0099', 'email' => 'sierra.hw@gmail.com', 'address' => 'Baguio City, Benguet', 'tin' => '567-890-123-000', 'industry' => 'Hardware & Quarry Supply', 'credit_limit' => 75000, 'payment_terms' => 'Net 30', 'contract_ref' => 'MSA-2026-SH-001', 'contract_expiry' => '2026-12-31', 'status' => 'Active', 'archived' => true],
        ];

        foreach ($customers as $data) {
            $archived = $data['archived'] ?? false;
            unset($data['archived']);

            $customer = Customer::withTrashed()->updateOrCreate(
                ['email' => $data['email']],
                $data
            );

            if ($archived && ! $customer->trashed()) {
                $customer->delete();
            } elseif (! $archived && $customer->trashed()) {
                $customer->restore();
            }
        }
    }
}