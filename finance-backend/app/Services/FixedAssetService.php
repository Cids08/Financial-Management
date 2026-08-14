<?php

namespace App\Services;

use App\Models\FixedAsset;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class FixedAssetService
{
    protected const PER_PAGE = 15;

    /**
     * @param array{search?: string, category?: string, status?: string, archived?: bool} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
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
}