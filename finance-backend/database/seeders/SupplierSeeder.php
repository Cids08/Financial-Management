<?php

namespace Database\Seeders;

use App\Models\Supplier;
use Illuminate\Database\Seeder;

class SupplierSeeder extends Seeder
{
    public function run(): void
    {
        $suppliers = [
            ['supplier_name' => 'Northgate Supplies Inc.', 'contact_person' => 'Rico Alvarado', 'contact_number' => '0917 111 2233', 'email' => 'sales@northgatesupplies.com', 'website' => 'northgatesupplies.com', 'address' => 'Pasig City, Metro Manila', 'tin' => '111-222-333-000', 'status' => 'Active'],
            ['supplier_name' => 'Pinnacle Freight Co.', 'contact_person' => 'Dennis Lim', 'contact_number' => '0918 222 3344', 'email' => 'billing@pinnaclefreight.com', 'website' => 'pinnaclefreight.com', 'address' => 'Mandaluyong City, Metro Manila', 'tin' => '222-333-444-000', 'status' => 'Active'],
            ['supplier_name' => 'Coastal Steel Traders', 'contact_person' => 'Marissa Ong', 'contact_number' => '0920 333 4455', 'email' => 'accounts@coastalsteel.ph', 'website' => 'coastalsteel.ph', 'address' => 'Iloilo City, Iloilo', 'tin' => '333-444-555-000', 'status' => 'Active'],
            ['supplier_name' => 'Alliance Fuel Depot', 'contact_person' => 'Gerald Sy', 'contact_number' => '0921 444 5566', 'email' => 'ar@alliancefuel.com', 'website' => null, 'address' => 'Cagayan de Oro, Misamis Oriental', 'tin' => '444-555-666-000', 'status' => 'Inactive'],
            ['supplier_name' => 'Sunrise Office Depot', 'contact_person' => 'Aina Cruz', 'contact_number' => '0917 555 6677', 'email' => 'orders@sunriseoffice.com', 'website' => 'sunriseoffice.com', 'address' => 'Taguig City, Metro Manila', 'tin' => '555-666-777-000', 'status' => 'Active', 'archived' => true],
        ];

        foreach ($suppliers as $data) {
            $archived = $data['archived'] ?? false;
            unset($data['archived']);

            $supplier = Supplier::create($data);

            if ($archived) {
                $supplier->delete();
            }
        }
    }
}