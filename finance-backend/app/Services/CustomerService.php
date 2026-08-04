<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class CustomerService
{
    public function list(array $filters = []): LengthAwarePaginator
    {
        $query = Customer::query();

        $query->when(
            $filters['archived'] ?? false,
            fn (Builder $q) => $q->onlyTrashed(),
        );

        $query->when(
            ! empty($filters['status']) && $filters['status'] !== 'all',
            fn (Builder $q) => $q->where('status', $filters['status'])
        );

        $query->search($filters['search'] ?? null);

        return $query->orderBy('customer_name')->paginate($filters['per_page'] ?? 15);
    }

    public function create(array $data, User $actor): Customer
    {
        $data['updated_by'] = $actor->id;

        return Customer::create($data);
    }

    public function update(Customer $customer, array $data, User $actor): Customer
    {
        $data['updated_by'] = $actor->id;
        $customer->fill($data);
        $customer->save();

        return $customer->fresh();
    }

    public function archive(Customer $customer, User $actor): Customer
    {
        $customer->update(['status' => 'Inactive', 'deleted_by' => $actor->id]);
        $customer->delete(); // soft delete

        return $customer;
    }

    public function restore(Customer $customer): Customer
    {
        $customer->restore();
        $customer->update(['deleted_by' => null]);

        return $customer;
    }

    public function stats(): array
    {
        return [
            'total' => Customer::count(),
            'active' => Customer::where('status', 'Active')->count(),
            'inactive' => Customer::where('status', 'Inactive')->count(),
            'archived' => Customer::onlyTrashed()->count(),
        ];
    }
}