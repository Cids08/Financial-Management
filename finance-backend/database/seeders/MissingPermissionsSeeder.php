<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class MissingPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            // Fixed Assets
            ['permission_name' => 'fixed_assets.view', 'display_name' => 'View Fixed Assets', 'module' => 'Fixed Assets', 'description' => 'View equipment, vehicles, and other capital assets.'],
            ['permission_name' => 'fixed_assets.manage', 'display_name' => 'Manage Fixed Assets', 'module' => 'Fixed Assets', 'description' => 'Add, edit, archive, and restore fixed assets.'],

            // Cash Accounts
            ['permission_name' => 'cash_accounts.view', 'display_name' => 'View Cash Accounts', 'module' => 'Cash Accounts', 'description' => 'View bank and cash accounts used for collections and disbursements.'],
            ['permission_name' => 'cash_accounts.manage', 'display_name' => 'Manage Cash Accounts', 'module' => 'Cash Accounts', 'description' => 'Add, edit, archive, and restore cash accounts.'],

            // Tax Obligations
            ['permission_name' => 'tax_obligations.view', 'display_name' => 'View Tax Obligations', 'module' => 'Tax Obligations', 'description' => 'View statutory tax filings and payments.'],
            ['permission_name' => 'tax_obligations.manage', 'display_name' => 'Manage Tax Obligations', 'module' => 'Tax Obligations', 'description' => 'Add and update tax obligation records.'],

            // AI Recommendations
            ['permission_name' => 'ai_recommendations.view', 'display_name' => 'View AI Recommendations', 'module' => 'AI Recommendations', 'description' => 'View AI-generated financial recommendations and the advisor chat.'],
        ];

        foreach ($permissions as $data) {
            Permission::firstOrCreate(
                ['permission_name' => $data['permission_name']],
                $data
            );
        }
    }
}