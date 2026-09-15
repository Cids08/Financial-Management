<?php

namespace App\Services;

use App\Models\Title;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;

class TitleService
{
    public function list(array $filters = []): LengthAwarePaginator
    {
        $query = Title::query()->withCount('users');

        $query = ($filters['archived'] ?? false)
            ? $query->onlyTrashed()
            : $query;

        return $query
            ->search($filters['search'] ?? null)
            ->orderBy('name')
            ->orderBy('id')
            ->paginate($filters['per_page'] ?? 15);
    }

    public function create(array $data): Title
    {
        return Title::create($data)->loadCount('users');
    }

    public function update(Title $title, array $data): Title
    {
        $title->fill($data);
        $title->save();

        return $title->fresh()->loadCount('users');
    }

    /**
     * @throws ValidationException
     */
    public function archive(Title $title): void
    {
        $headcount = $title->users()->count();

        if ($headcount > 0) {
            throw ValidationException::withMessages([
                'title' => ["This position has {$headcount} employee(s) assigned. Reassign them before archiving."],
            ]);
        }

        $title->delete();
    }

    public function restore(Title $title): void
    {
        $title->restore();
    }
}