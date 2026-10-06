<?php

namespace App\Services;

use App\Models\AuditLog;
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

        // Search was plumbed through by the controller but never applied —
        // the frontend's search box appeared to do nothing.
        if (! empty($filters['search'])) {
            $term = $filters['search'];
            $query->where(function ($q) use ($term) {
                $q->where('account_name', 'ilike', "%{$term}%")
                    ->orWhere('account_code', 'ilike', "%{$term}%");
            });
        }

        $perPage = ! empty($filters['per_page']) ? min((int) $filters['per_page'], 200) : self::PER_PAGE;

        return $query->paginate($perPage);
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
        // current_balance is a running total maintained by the posting paths
        // (collections, disbursements, expenses, tax payments). Accepting it
        // from an edit form let an operator retype the number, which moved the
        // Cash Accounts page, the dashboard's "Cash on Hand", and every
        // insufficient-funds gate while leaving the journal-derived balance on
        // the linked chart of accounts untouched — a permanent desync with no
        // trace. Drop it here as well as in the request rules, so a client
        // cannot get it through by any route.
        unset($data['current_balance'], $data['opening_balance']);

        return DB::transaction(function () use ($user, $cashAccount, $data) {
            $before = $cashAccount->only(['account_name', 'account_number', 'account_type', 'bank_name', 'branch_name', 'swift_code', 'status', 'is_default', 'currency']);

            $cashAccount->update([
                ...$data,
                'updated_by' => $user->id,
            ]);

            // This service previously wrote no audit entry at all, unlike the
            // other money services. Bank details are exactly the sort of thing
            // that needs an attributable before/after.
            AuditLog::create([
                'user_id' => $user->id,
                'module' => 'Cash Accounts',
                'action' => 'update',
                'record_id' => $cashAccount->id,
                'activity_description' => sprintf('Updated cash account %s.', $cashAccount->account_name),
                'old_values' => $before,
                'new_values' => $cashAccount->fresh()->only(array_keys($before)),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
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