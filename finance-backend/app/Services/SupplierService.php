<?php

namespace App\Services;

use App\Models\Supplier;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class SupplierService
{
    public function list(array $filters = []): LengthAwarePaginator
    {
        $query = Supplier::query();

        $query->when(
            $filters['archived'] ?? false,
            fn (Builder $q) => $q->onlyTrashed(),
        );

        $query->when(
            ! empty($filters['status']) && $filters['status'] !== 'all',
            fn (Builder $q) => $q->where('status', $filters['status'])
        );

        $query->search($filters['search'] ?? null);

        return $query->orderBy('supplier_name')->paginate($filters['per_page'] ?? 15);
    }

    public function create(array $data, User $actor): Supplier
    {
        $data['updated_by'] = $actor->id;

        return Supplier::create($data);
    }

    public function update(Supplier $supplier, array $data, User $actor): Supplier
    {
        $data['updated_by'] = $actor->id;
        $supplier->fill($data);
        $supplier->save();

        return $supplier->fresh();
    }

    public function archive(Supplier $supplier, User $actor): Supplier
    {
        $supplier->update(['status' => 'Inactive', 'deleted_by' => $actor->id]);
        $supplier->delete();

        return $supplier;
    }

    public function restore(Supplier $supplier): Supplier
    {
        $supplier->restore();
        $supplier->update(['deleted_by' => null]);

        return $supplier;
    }

    public function stats(): array
    {
        return [
            'total' => Supplier::count(),
            'active' => Supplier::where('status', 'Active')->count(),
            'inactive' => Supplier::where('status', 'Inactive')->count(),
            'archived' => Supplier::onlyTrashed()->count(),
        ];
    }
}