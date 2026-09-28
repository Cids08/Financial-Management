<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\FixedAsset;
use App\Models\User;
use Illuminate\Database\Seeder;

class FixedAssetSeeder extends Seeder
{
    public function run(): void
    {
        $adminId = User::whereHas('role', fn ($q) => $q->whereIn('name', ['admin', 'super-admin'])->orWhereIn('display_name', ['Admin', 'Super Admin']))->value('id')
            ?? User::first()?->id;

        $engineeringDeptId = Department::where('department_name', 'like', '%Engineering%')->orWhere('department_name', 'like', '%Operations%')->value('id')
            ?? Department::first()?->id;
        $itDeptId = Department::where('department_name', 'like', '%IT%')->orWhere('department_name', 'like', '%Technology%')->value('id')
            ?? Department::first()?->id;
        $financeDeptId = Department::where('department_name', 'like', '%Finance%')->orWhere('department_name', 'like', '%Accounting%')->value('id')
            ?? Department::first()?->id;

        $assets = [
            [
                'asset_code' => 'FA-2024-001',
                'asset_name' => 'Caterpillar 320D Hydraulic Excavator',
                'asset_category' => 'Heavy Equipment',
                'serial_number' => 'CAT-320D-99812',
                'brand' => 'Caterpillar',
                'model' => '320D Series II',
                'location' => 'Yard 1 - North Project Site',
                'department_id' => $engineeringDeptId,
                'purchase_date' => '2024-01-15',
                'purchase_cost' => 4500000.00,
                'salvage_value' => 450000.00,
                'useful_life_years' => 10,
                'depreciation_method' => 'Straight Line',
                'annual_depreciation' => 405000.00,
                'accumulated_depreciation' => 405000.00,
                'book_value' => 4095000.00,
                'status' => 'Active',
                'remarks' => 'Operational heavy civil earthmover',
                'created_by' => $adminId,
            ],
            [
                'asset_code' => 'FA-2024-002',
                'asset_name' => 'Isuzu Giga 10-Wheeler Heavy Dump Truck',
                'asset_category' => 'Vehicles',
                'serial_number' => 'ISZ-GIGA-44210',
                'brand' => 'Isuzu',
                'model' => 'Giga CYZ52',
                'location' => 'Logistics Depot - Manila',
                'department_id' => $engineeringDeptId,
                'purchase_date' => '2024-03-20',
                'purchase_cost' => 2800000.00,
                'salvage_value' => 280000.00,
                'useful_life_years' => 7,
                'depreciation_method' => 'Straight Line',
                'annual_depreciation' => 360000.00,
                'accumulated_depreciation' => 360000.00,
                'book_value' => 2440000.00,
                'status' => 'Active',
                'remarks' => 'Aggregate transport unit for high-volume quarry hauling',
                'created_by' => $adminId,
            ],
            [
                'asset_code' => 'FA-2024-003',
                'asset_name' => 'Komatsu WA380 Wheel Loader',
                'asset_category' => 'Heavy Equipment',
                'serial_number' => 'KOM-WA380-6102',
                'brand' => 'Komatsu',
                'model' => 'WA380-6',
                'location' => 'Subic Quarry Facility',
                'department_id' => $engineeringDeptId,
                'purchase_date' => '2024-02-10',
                'purchase_cost' => 3900000.00,
                'salvage_value' => 390000.00,
                'useful_life_years' => 8,
                'depreciation_method' => 'Straight Line',
                'annual_depreciation' => 438750.00,
                'accumulated_depreciation' => 438750.00,
                'book_value' => 3461250.00,
                'status' => 'Active',
                'remarks' => 'Stockpile loader and quarry handling',
                'created_by' => $adminId,
            ],
            [
                'asset_code' => 'FA-2025-001',
                'asset_name' => 'Dell PowerEdge R750 Enterprise Rack Server',
                'asset_category' => 'IT Equipment',
                'serial_number' => 'DELL-R750-8812',
                'brand' => 'Dell EMC',
                'model' => 'PowerEdge R750',
                'location' => 'Head Office - Server Room',
                'department_id' => $itDeptId,
                'purchase_date' => '2025-01-10',
                'purchase_cost' => 650000.00,
                'salvage_value' => 50000.00,
                'useful_life_years' => 5,
                'depreciation_method' => 'Straight Line',
                'annual_depreciation' => 120000.00,
                'accumulated_depreciation' => 120000.00,
                'book_value' => 530000.00,
                'status' => 'Active',
                'remarks' => 'ERP and database primary host cluster',
                'created_by' => $adminId,
            ],
            [
                'asset_code' => 'FA-2025-002',
                'asset_name' => 'Toyota Hilux 4x4 Double Cab Field Vehicle',
                'asset_category' => 'Vehicles',
                'serial_number' => 'TOY-HLX-77192',
                'brand' => 'Toyota',
                'model' => 'Hilux 2.8 GR-S 4x4',
                'location' => 'Regional Engineering Fleet',
                'department_id' => $engineeringDeptId,
                'purchase_date' => '2025-04-05',
                'purchase_cost' => 1750000.00,
                'salvage_value' => 250000.00,
                'useful_life_years' => 6,
                'depreciation_method' => 'Straight Line',
                'annual_depreciation' => 250000.00,
                'accumulated_depreciation' => 125000.00,
                'book_value' => 1625000.00,
                'status' => 'Active',
                'remarks' => 'Site engineer supervision transport',
                'created_by' => $adminId,
            ],
            [
                'asset_code' => 'FA-2025-003',
                'asset_name' => 'Konica Minolta bizhub C360i MFP Copier',
                'asset_category' => 'Office Equipment',
                'serial_number' => 'KM-BIZHUB-3601',
                'brand' => 'Konica Minolta',
                'model' => 'bizhub C360i',
                'location' => 'Finance & Accounting Floor',
                'department_id' => $financeDeptId,
                'purchase_date' => '2025-02-18',
                'purchase_cost' => 380000.00,
                'salvage_value' => 38000.00,
                'useful_life_years' => 5,
                'depreciation_method' => 'Straight Line',
                'annual_depreciation' => 68400.00,
                'accumulated_depreciation' => 68400.00,
                'book_value' => 311600.00,
                'status' => 'Active',
                'remarks' => 'High volume financial statement printing & scanning',
                'created_by' => $adminId,
            ],
            [
                'asset_code' => 'FA-2025-004',
                'asset_name' => 'Atlas Copco XAS 188 Portable Air Compressor',
                'asset_category' => 'Heavy Equipment',
                'serial_number' => 'AC-XAS188-449',
                'brand' => 'Atlas Copco',
                'model' => 'XAS 188 Pace',
                'location' => 'Yard 2 - Equipment Bay',
                'department_id' => $engineeringDeptId,
                'purchase_date' => '2025-05-12',
                'purchase_cost' => 1250000.00,
                'salvage_value' => 125000.00,
                'useful_life_years' => 5,
                'depreciation_method' => 'Straight Line',
                'annual_depreciation' => 225000.00,
                'accumulated_depreciation' => 56250.00,
                'book_value' => 1193750.00,
                'status' => 'Under Maintenance',
                'remarks' => 'Scheduled 500-hour hydraulic & filter servicing',
                'created_by' => $adminId,
            ],
            [
                'asset_code' => 'FA-2023-009',
                'asset_name' => 'Mitsubishi Canter FB Refrigerated Delivery Van',
                'asset_category' => 'Vehicles',
                'serial_number' => 'MITS-FB-11029',
                'brand' => 'Mitsubishi Fuso',
                'model' => 'Canter FB 4-Wheeler',
                'location' => 'Central Depot',
                'department_id' => $engineeringDeptId,
                'purchase_date' => '2023-01-10',
                'purchase_cost' => 1400000.00,
                'salvage_value' => 140000.00,
                'useful_life_years' => 5,
                'depreciation_method' => 'Straight Line',
                'annual_depreciation' => 252000.00,
                'accumulated_depreciation' => 1260000.00,
                'book_value' => 140000.00,
                'status' => 'Disposed',
                'remarks' => 'Reached salvage threshold; archived for historical audit',
                'created_by' => $adminId,
                'archived' => true,
            ],
        ];

        foreach ($assets as $data) {
            $archived = $data['archived'] ?? false;
            unset($data['archived']);

            $asset = FixedAsset::withTrashed()->updateOrCreate(
                ['asset_code' => $data['asset_code']],
                $data
            );

            if ($archived && ! $asset->trashed()) {
                $asset->delete();
            } elseif (! $archived && $asset->trashed()) {
                $asset->restore();
            }
        }
    }
}
