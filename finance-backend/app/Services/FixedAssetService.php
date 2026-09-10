<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ChartOfAccount;
use App\Models\FixedAsset;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class FixedAssetService
{
    protected const PER_PAGE = 15;

    public static function ensureTableExists(): void
    {
        if (! Schema::hasTable('fixed_assets')) {
            Schema::create('fixed_assets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
                $table->string('asset_code')->unique();
                $table->string('asset_name');
                $table->string('asset_category')->default('Heavy Equipment');
                $table->string('serial_number')->nullable();
                $table->string('brand')->nullable();
                $table->string('model')->nullable();
                $table->string('location')->nullable();
                $table->date('purchase_date');
                $table->decimal('purchase_cost', 15, 2);
                $table->decimal('salvage_value', 15, 2)->default(0);
                $table->integer('useful_life_years')->default(5);
                $table->string('depreciation_method')->default('Straight Line');
                $table->decimal('annual_depreciation', 15, 2)->default(0);
                $table->decimal('accumulated_depreciation', 15, 2)->default(0);
                $table->decimal('book_value', 15, 2);
                $table->string('status')->default('Active');
                $table->text('remarks')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
                $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();

                $table->index('department_id');
                $table->index('asset_category');
                $table->index('status');
                $table->index('purchase_date');
            });

            static::seedInitialAssets();
        }

        // Ensure chart of accounts for depreciation exist
        ChartOfAccount::firstOrCreate(
            ['account_code' => '5500'],
            [
                'account_name' => 'Depreciation Expense',
                'account_type' => 'Expense',
                'account_category' => 'Operating Expense',
                'description' => 'Periodic depreciation of capital assets',
                'is_active' => true,
            ]
        );

        ChartOfAccount::firstOrCreate(
            ['account_code' => '1590'],
            [
                'account_name' => 'Accumulated Depreciation',
                'account_type' => 'Asset',
                'account_category' => 'Non-Current Asset',
                'description' => 'Contra-asset for cumulative asset depreciation',
                'is_active' => true,
            ]
        );
    }

    protected static function seedInitialAssets(): void
    {
        $adminId = User::whereHas('role', fn ($q) => $q->whereIn('role_name', ['Admin', 'Super Admin', 'admin', 'super-admin']))->value('id')
            ?? User::first()?->id;

        $deptId = DB::table('departments')->value('id');

        $initialAssets = [
            [
                'asset_code' => 'FA-2024-001',
                'asset_name' => 'Caterpillar 320D Hydraulic Excavator',
                'asset_category' => 'Heavy Equipment',
                'serial_number' => 'CAT-320D-99812',
                'brand' => 'Caterpillar',
                'model' => '320D Series II',
                'location' => 'Yard 1 - North Project Site',
                'department_id' => $deptId,
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
                'department_id' => $deptId,
                'purchase_date' => '2024-03-20',
                'purchase_cost' => 2800000.00,
                'salvage_value' => 280000.00,
                'useful_life_years' => 7,
                'depreciation_method' => 'Straight Line',
                'annual_depreciation' => 360000.00,
                'accumulated_depreciation' => 360000.00,
                'book_value' => 2440000.00,
                'status' => 'Active',
                'remarks' => 'Aggregate transport unit',
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
                'department_id' => $deptId,
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
                'department_id' => $deptId,
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
                'department_id' => $deptId,
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
                'department_id' => $deptId,
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
        ];

        foreach ($initialAssets as $data) {
            FixedAsset::create($data);
        }
    }

    /**
     * @param array{search?: string, category?: string, status?: string, archived?: bool} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        self::ensureTableExists();

        $query = FixedAsset::query()->with('department');

        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        if (! empty($filters['category']) && $filters['category'] !== 'all') {
            $query->where('asset_category', $filters['category']);
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $query->where('status', $filters['status']);
        }

        $query->search($filters['search'] ?? null)->latest();

        return $query->paginate(self::PER_PAGE);
    }

    public function create(User $user, array $data): FixedAsset
    {
        self::ensureTableExists();

        return DB::transaction(function () use ($user, $data) {
            $depreciation = $this->calculateDepreciation($data);

            return FixedAsset::create([
                ...$data,
                ...$depreciation,
                'salvage_value'        => $data['salvage_value'] ?? 0,
                'depreciation_method'  => $data['depreciation_method'] ?? 'Straight Line',
                'status'               => $data['status'] ?? 'Active',
                'created_by'           => $user->id,
                'updated_by'           => $user->id,
            ]);
        });
    }

    public function update(User $user, FixedAsset $asset, array $data): FixedAsset
    {
        return DB::transaction(function () use ($user, $asset, $data) {
            $depreciation = $this->calculateDepreciation($data);

            $asset->update([
                ...$data,
                ...$depreciation,
                'salvage_value' => $data['salvage_value'] ?? 0,
                'updated_by'    => $user->id,
            ]);

            return $asset->fresh('department');
        });
    }

    /**
     * Archive: soft delete + force Disposed, matching the mock's
     * `toggleArchive` behavior exactly (archiving always marks disposed).
     */
    public function archive(User $user, FixedAsset $asset): FixedAsset
    {
        return DB::transaction(function () use ($user, $asset) {
            $asset->update(['status' => 'Disposed', 'deleted_by' => $user->id]);
            $asset->delete();

            return $asset->fresh('department');
        });
    }

    /**
     * Restore: un-delete only. Status intentionally stays Disposed, same
     * as the mock — the user reactivates explicitly via edit if needed.
     */
    public function restore(User $user, FixedAsset $asset): FixedAsset
    {
        return DB::transaction(function () use ($user, $asset) {
            $asset->restore();
            $asset->update(['updated_by' => $user->id]);

            return $asset->fresh('department');
        });
    }

    /**
     * Straight-line depreciation, computed server-side and stored (per
     * the ERD's columns) rather than derived on every read. Ported
     * directly from the frontend's currentBookValue() so both sides
     * agree on the number.
     */
    protected function calculateDepreciation(array $data): array
    {
        $cost = (float) ($data['purchase_cost'] ?? 0);
        $salvage = (float) ($data['salvage_value'] ?? 0);
        $usefulLife = max(1, (int) ($data['useful_life_years'] ?? 1));
        $purchaseDate = Carbon::parse($data['purchase_date'] ?? now());

        $annualDepreciation = round(($cost - $salvage) / $usefulLife, 2);
        $yearsElapsed = $purchaseDate->diffInDays(now()) / 365.25;

        $accumulatedDepreciation = min(
            round($annualDepreciation * $yearsElapsed, 2),
            max(0, $cost - $salvage) // never depreciate past the depreciable base
        );

        $bookValue = max($salvage, round($cost - $accumulatedDepreciation, 2));

        return [
            'annual_depreciation'      => $annualDepreciation,
            'accumulated_depreciation' => $accumulatedDepreciation,
            'book_value'               => $bookValue,
        ];
    }

    /**
     * Preview periodic depreciation across eligible active fixed assets.
     */
    public function getDepreciationPreview(array $params): array
    {
        self::ensureTableExists();

        $year = (int) ($params['fiscal_year'] ?? now()->year);
        $period = $params['period'] ?? 'monthly';
        $month = !empty($params['month']) ? (int) $params['month'] : now()->month;
        $category = $params['category'] ?? 'all';
        $methodOverride = $params['depreciation_method'] ?? null;

        $periodKey = $period === 'monthly'
            ? sprintf('%04d-%02d', $year, $month)
            : sprintf('%04d', $year);

        $voucherNo = $period === 'monthly'
            ? sprintf('DEP-%04d%02d', $year, $month)
            : sprintf('DEP-%04d-ANNUAL', $year);

        $alreadyPosted = JournalEntry::where('transaction_no', $voucherNo)->exists();

        $query = FixedAsset::query()
            ->with('department')
            ->whereNull('deleted_at')
            ->where('status', 'Active')
            ->whereColumn('book_value', '>', 'salvage_value');

        if ($category !== 'all' && !empty($category)) {
            $query->where('asset_category', $category);
        }

        $assets = $query->orderBy('asset_code')->get();

        $proposals = $assets->map(function (FixedAsset $asset) use ($period, $methodOverride) {
            $cost = (float) $asset->purchase_cost;
            $salvage = (float) $asset->salvage_value;
            $currentBook = (float) $asset->book_value;
            $currentAccum = (float) $asset->accumulated_depreciation;
            $usefulLife = max(1, (int) $asset->useful_life_years);
            $method = $methodOverride ?: ($asset->depreciation_method ?: 'Straight Line');

            $depreciableRemaining = max(0, $currentBook - $salvage);

            if ($method === 'Double Declining') {
                $rate = 2.0 / $usefulLife;
                $annualDep = $currentBook * $rate;
            } elseif ($method === 'Sum of Years Digits') {
                $sumDigits = ($usefulLife * ($usefulLife + 1)) / 2;
                $yearsElapsed = Carbon::parse($asset->purchase_date ?: now())->diffInYears(now());
                $remainingLife = max(1, $usefulLife - floor($yearsElapsed));
                $annualDep = ($cost - $salvage) * ($remainingLife / $sumDigits);
            } else {
                // Straight Line default
                $annualDep = ($cost - $salvage) / $usefulLife;
            }

            $periodDep = $period === 'monthly' ? ($annualDep / 12) : $annualDep;
            $periodDep = min(round($periodDep, 2), $depreciableRemaining);

            $projectedAccum = round($currentAccum + $periodDep, 2);
            $projectedBook = round(max($salvage, $cost - $projectedAccum), 2);

            return [
                'asset_id'                 => $asset->id,
                'asset_code'               => $asset->asset_code,
                'asset_name'               => $asset->asset_name,
                'asset_category'           => $asset->asset_category,
                'department_name'          => $asset->department?->department_name ?? 'General',
                'purchase_cost'            => $cost,
                'salvage_value'            => $salvage,
                'current_accumulated'      => $currentAccum,
                'current_book_value'       => $currentBook,
                'period_depreciation'      => $periodDep,
                'projected_accumulated'    => $projectedAccum,
                'projected_book_value'     => $projectedBook,
                'method'                   => $method,
                'is_fully_depreciated'     => $projectedBook <= $salvage,
            ];
        })->filter(fn ($p) => $p['period_depreciation'] > 0)->values();

        $totalDep = round($proposals->sum('period_depreciation'), 2);

        return [
            'period'           => $period,
            'period_key'       => $periodKey,
            'voucher_number'   => $voucherNo,
            'already_posted'   => $alreadyPosted,
            'proposals'        => $proposals->toArray(),
            'totals'           => [
                'count'                   => $proposals->count(),
                'total_cost'              => round($proposals->sum('purchase_cost'), 2),
                'total_current_book'      => round($proposals->sum('current_book_value'), 2),
                'total_depreciation'      => $totalDep,
                'total_projected_book'    => round($proposals->sum('projected_book_value'), 2),
            ],
            'gl_impact' => [
                'debit_account'  => [
                    'code' => '5500',
                    'name' => 'Depreciation Expense',
                    'amount' => $totalDep,
                ],
                'credit_account' => [
                    'code' => '1590',
                    'name' => 'Accumulated Depreciation',
                    'amount' => $totalDep,
                ],
            ],
        ];
    }

    /**
     * Execute depreciation run: update assets and post GL double entry atomically.
     */
    public function executeDepreciationRun(User $user, array $data): array
    {
        $year = (int) $data['fiscal_year'];
        $period = $data['period'];
        $month = !empty($data['month']) ? (int) $data['month'] : null;
        $postingDate = $data['posting_date'] ?? now()->toDateString();
        $remarks = $data['remarks'] ?? null;
        $assetIds = !empty($data['asset_ids']) ? $data['asset_ids'] : null;

        $periodKey = $period === 'monthly'
            ? sprintf('%04d-%02d', $year, $month)
            : sprintf('%04d', $year);

        $voucherNo = $period === 'monthly'
            ? sprintf('DEP-%04d%02d', $year, $month)
            : sprintf('DEP-%04d-ANNUAL', $year);

        // Enforce idempotency: prevent duplicate depreciation posting for the exact period
        if (JournalEntry::where('transaction_no', $voucherNo)->exists()) {
            throw ValidationException::withMessages([
                'period' => "Depreciation run for period {$periodKey} has already been posted under transaction {$voucherNo}.",
            ]);
        }

        // Get preview calculations
        $preview = $this->getDepreciationPreview([
            'fiscal_year' => $year,
            'period'      => $period,
            'month'       => $month,
        ]);

        $proposals = collect($preview['proposals']);
        if ($assetIds) {
            $proposals = $proposals->whereIn('asset_id', $assetIds);
        }

        if ($proposals->isEmpty()) {
            throw ValidationException::withMessages([
                'asset_ids' => 'No depreciable assets found for this run.',
            ]);
        }

        $totalDepreciation = round($proposals->sum('period_depreciation'), 2);

        // Resolve Chart of Accounts entries
        $expenseCoa = ChartOfAccount::where('account_code', '5500')
            ->orWhere('account_name', 'Depreciation Expense')
            ->first();
        $accumCoa = ChartOfAccount::where('account_code', '1590')
            ->orWhere('account_name', 'Accumulated Depreciation')
            ->first();

        if (! $expenseCoa || ! $accumCoa) {
            throw ValidationException::withMessages([
                'chart_of_accounts' => 'Depreciation accounts (5500 Depreciation Expense / 1590 Accumulated Depreciation) are not found in Chart of Accounts.',
            ]);
        }

        $updatedAssets = [];

        DB::transaction(function () use (
            $user, $proposals, $voucherNo, $periodKey, $postingDate, $remarks,
            $totalDepreciation, $expenseCoa, $accumCoa, &$updatedAssets
        ) {
            foreach ($proposals as $prop) {
                $asset = FixedAsset::lockForUpdate()->findOrFail($prop['asset_id']);

                $asset->update([
                    'accumulated_depreciation' => $prop['projected_accumulated'],
                    'book_value'               => $prop['projected_book_value'],
                    'updated_by'               => $user->id,
                ]);

                $updatedAssets[] = [
                    'id'                  => $asset->id,
                    'asset_code'          => $asset->asset_code,
                    'asset_name'          => $asset->asset_name,
                    'depreciation_amount' => $prop['period_depreciation'],
                    'new_book_value'      => $prop['projected_book_value'],
                ];
            }

            // Create posted Journal Entry
            $journalEntry = JournalEntry::create([
                'transaction_no'   => $voucherNo,
                'transaction_date' => $postingDate,
                'description'      => "Asset Depreciation Run for period {$periodKey} — " . count($updatedAssets) . " assets" . ($remarks ? " ({$remarks})" : ''),
                'status'           => 'Posted',
                'posted_by'        => $user->id,
                'posted_at'        => now(),
                'created_by'       => $user->id,
            ]);

            // Balanced lines: Dr 5500 Expense, Cr 1590 Asset Contra
            JournalEntryLine::insert([
                [
                    'journal_entry_id' => $journalEntry->id,
                    'account_id'       => $expenseCoa->id,
                    'debit'            => $totalDepreciation,
                    'credit'           => 0,
                    'reference_type'   => 'fixed_asset_depreciation',
                    'reference_id'     => null,
                    'remarks'          => "Depreciation Expense for {$periodKey}",
                    'created_at'       => now(),
                    'updated_at'       => now(),
                ],
                [
                    'journal_entry_id' => $journalEntry->id,
                    'account_id'       => $accumCoa->id,
                    'debit'            => 0,
                    'credit'           => $totalDepreciation,
                    'reference_type'   => 'fixed_asset_depreciation',
                    'reference_id'     => null,
                    'remarks'          => "Accumulated Depreciation for {$periodKey}",
                    'created_at'       => now(),
                    'updated_at'       => now(),
                ],
            ]);

            // Audit Trail
            AuditLog::create([
                'user_id'    => $user->id,
                'module'     => 'Fixed Assets',
                'action'     => 'depreciation_run',
                'record_id'  => $journalEntry->id,
                'old_values' => null,
                'new_values' => json_encode([
                    'period'             => $periodKey,
                    'voucher_number'     => $voucherNo,
                    'assets_count'       => count($updatedAssets),
                    'total_depreciation' => $totalDepreciation,
                    'posting_date'       => $postingDate,
                ]),
                'ip_address' => request()->ip(),
            ]);

            // Notify finance and accounting users of the depreciation run posting
            try {
                $recipientIds = User::whereHas('role.permissions', function ($q) {
                    $q->whereIn('name', ['reports.view', 'chart-of-accounts.view']);
                })->orWhereHas('role', function ($q) {
                    $q->whereIn('name', ['admin', 'super-admin', 'Super Admin', 'Admin', 'Finance Manager']);
                })->pluck('id')->push($user->id)->unique()->filter()->all();

                $formattedDep = number_format($totalDepreciation, 2);
                $assetsCount = count($updatedAssets);

                foreach ($recipientIds as $recipientId) {
                    Notification::create([
                        'user_id' => $recipientId,
                        'title'   => 'Depreciation Run Posted',
                        'message' => "Depreciation run for {$periodKey} posted voucher {$voucherNo}. Processed {$assetsCount} assets totaling ₱{$formattedDep} in depreciation expense.",
                        'type'    => 'Info',
                        'is_read' => false,
                    ]);
                }
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning("Failed to dispatch depreciation run notification: {$e->getMessage()}");
            }
        });

        return [
            'voucher_number'     => $voucherNo,
            'period_key'         => $periodKey,
            'total_depreciation' => $totalDepreciation,
            'assets_count'       => count($updatedAssets),
            'updated_assets'     => $updatedAssets,
        ];
    }
}