<?php

namespace App\Services;

use App\Models\CashAccount;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class CashAccountService
{
    protected const PER_PAGE = 15;

    /**
     * @param array{search?: string, type?: string, archived?: bool} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = CashAccount::query();

        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        if (! empty($filters['type']) && $filters['type'] !== 'all') {
            $query->where('account_type', $filters['type']);
        }

        $query->search($filters['search'] ?? null)->latest();

        return $query->paginate(self::PER_PAGE);
    }

    public function create(User $user, array $data): CashAccount
    {
        return DB::transaction(function () use ($user, $data) {
            return CashAccount::create([
                ...$data,
                'account_code'    => $data['account_code'] ?? $this->generateAccountCode(),
                'current_balance' => $data['current_balance'] ?? 0,
                'opening_balance' => $data['current_balance'] ?? 0, // opening = starting balance at creation
                'status'          => $data['status'] ?? 'Active',
                'currency'        => $data['currency'] ?? 'PHP',
                'updated_by'      => $user->id,
            ]);
        });
    }

    public function update(User $user, CashAccount $cashAccount, array $data): CashAccount
    {
        return DB::transaction(function () use ($user, $cashAccount, $data) {
            $cashAccount->update([
                ...$data,
                'updated_by' => $user->id,
            ]);

            return $cashAccount->fresh();
        });
    }

    /**
     * Archive: soft delete + force Inactive, matching the mock's
     * `toggleArchive` behavior exactly.
     */
    public function archive(User $user, CashAccount $cashAccount): CashAccount
    {
        return DB::transaction(function () use ($user, $cashAccount) {
            $cashAccount->update(['status' => 'Inactive', 'deleted_by' => $user->id]);
            $cashAccount->delete();

            return $cashAccount->fresh();
        });
    }

    public function restore(User $user, CashAccount $cashAccount): CashAccount
    {
        return DB::transaction(function () use ($user, $cashAccount) {
            $cashAccount->restore();
            $cashAccount->update(['updated_by' => $user->id]);

            return $cashAccount->fresh();
        });
    }

    /**
     * The ERD marks account_code as an auto-generated identifier, but
     * the current frontend form doesn't collect one — so generate a
     * sequential, collision-safe code when it isn't supplied.
     */
    protected function generateAccountCode(): string
    {
        $last = CashAccount::withTrashed()->orderByDesc('id')->first();
        $next = $last ? $last->id + 1 : 1;

        return 'CA-' . str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }
}