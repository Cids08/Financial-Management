<?php

namespace Database\Seeders;

use App\Models\Supplier;
use Illuminate\Database\Seeder;

class SupplierSeeder extends Seeder
{
    public function run(): void
    {
        $suppliers = [
            ['supplier_name' => 'Northgate Supplies Inc.', 'category' => 'Fleet Consumables & Tires', 'credit_limit' => 250000, 'payment_terms' => 'Net 30', 'contract_ref' => 'CTR-2026-NSI-02', 'contract_expiry' => '2026-11-30', 'contact_person' => 'Rico Alvarado', 'position' => 'Sales Director', 'contact_number' => '0917 111 2233', 'email' => 'sales@northgatesupplies.com', 'website' => 'northgatesupplies.com', 'address' => 'Pasig City, Metro Manila', 'tin' => '111-222-333-000', 'status' => 'Active', 'default_withholding_type' => 'Goods'],
            ['supplier_name' => 'Pinnacle Freight Co.', 'category' => 'Heavy Hauling & Subcontracting', 'credit_limit' => 600000, 'payment_terms' => 'Net 15', 'contract_ref' => 'CTR-2025-PFC-11', 'contract_expiry' => '2026-10-31', 'contact_person' => 'Dennis Lim', 'position' => 'Logistics Head', 'contact_number' => '0918 222 3344', 'email' => 'billing@pinnaclefreight.com', 'website' => 'pinnaclefreight.com', 'address' => 'Mandaluyong City, Metro Manila', 'tin' => '222-333-444-000', 'status' => 'Active', 'default_withholding_type' => 'Services'],
            ['supplier_name' => 'Coastal Steel Traders', 'category' => 'Heavy Equipment Spare Parts', 'credit_limit' => 500000, 'payment_terms' => 'Net 45', 'contract_ref' => 'CTR-2026-CST-08', 'contract_expiry' => '2027-03-31', 'contact_person' => 'Marissa Ong', 'position' => 'Account Manager', 'contact_number' => '0920 333 4455', 'email' => 'accounts@coastalsteel.ph', 'website' => 'coastalsteel.ph', 'address' => 'Iloilo City, Iloilo', 'tin' => '333-444-555-000', 'status' => 'Active', 'default_withholding_type' => 'Goods'],
            ['supplier_name' => 'Alliance Fuel Depot', 'category' => 'Diesel Fuel & Lubricants', 'credit_limit' => 450000, 'payment_terms' => 'Net 30', 'contract_ref' => 'CTR-2025-AFD-01', 'contract_expiry' => '2026-12-31', 'contact_person' => 'Gerald Sy', 'position' => 'Fleet Sales Head', 'contact_number' => '0921 444 5566', 'email' => 'ar@alliancefuel.com', 'website' => null, 'address' => 'Cagayan de Oro, Misamis Oriental', 'tin' => '444-555-666-000', 'status' => 'Inactive', 'default_withholding_type' => 'Goods'],
            ['supplier_name' => 'Sunrise Office Depot', 'category' => 'Office & Administrative', 'credit_limit' => 50000, 'payment_terms' => 'Net 30', 'contract_ref' => 'PO-2026-SOD-05', 'contract_expiry' => '2026-12-31', 'contact_person' => 'Aina Cruz', 'position' => 'Store Manager', 'contact_number' => '0917 555 6677', 'email' => 'orders@sunriseoffice.com', 'website' => 'sunriseoffice.com', 'address' => 'Taguig City, Metro Manila', 'tin' => '555-666-777-000', 'status' => 'Active', 'default_withholding_type' => 'Goods', 'archived' => true],
        ];

        foreach ($suppliers as $data) {
            $archived = $data['archived'] ?? false;
            unset($data['archived']);

            $supplier = Supplier::withTrashed()->updateOrCreate(
                ['email' => $data['email']],
                $data
            );

            if ($archived && ! $supplier->trashed()) {
                $supplier->delete();
            } elseif (! $archived && $supplier->trashed()) {
                $supplier->restore();
            }
        }
    }
}