<?php

namespace App\Services;

use App\Models\Department;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Validation\ValidationException;

class DepartmentService
{
    public function list(array $filters = []): \Illuminate\Contracts\Pagination\LengthAwarePaginator
    {
        $query = Department::query()->withCount('users');

        $query = ($filters['archived'] ?? false)
            ? $query->onlyTrashed()
            : $query;

        return $query
            ->search($filters['search'] ?? null)
            ->orderBy('department_name')
            ->orderBy('id')
            ->paginate($filters['per_page'] ?? 15);
    }

    public function create(array $data): Department
    {
        $department = Department::create($data);

        return $department->loadCount('users');
    }

    public function update(Department $department, array $data): Department
    {
        $department->fill($data);
        $department->save();

        return $department->fresh()->loadCount('users');
    }

    /**
     * @throws ValidationException
     */
    public function archive(Department $department): void
    {
        $headcount = $department->users()->count();

        if ($headcount > 0) {
            throw ValidationException::withMessages([
                'department' => ["This department has {$headcount} employee(s) assigned. Reassign them before archiving."],
            ]);
        }

        $department->delete(); // soft delete — Department already uses SoftDeletes
    }

    public function restore(Department $department): void
    {
        $department->restore();
    }

    public function locatePage(Department $department, int $perPage): int
    {
        $position = Department::query()
            ->where(function ($q) use ($department) {
                $q->where('department_name', '<', $department->department_name)
                    ->orWhere(function ($q2) use ($department) {
                        $q2->where('department_name', $department->department_name)
                            ->where('id', '<', $department->id);
                    });
            })
            ->count();

        return intdiv($position, $perPage) + 1;
    }

    public function stats(): array
    {
        return [
            'total' => Department::count(),
            'active' => Department::where('is_active', true)->count(),
            'inactive' => Department::where('is_active', false)->count(),
            'archived' => Department::onlyTrashed()->count(),
        ];
    }
}