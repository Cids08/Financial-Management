<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ChartOfAccount;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ChartOfAccountService
{
    protected const PER_PAGE = 25;

    /**
     * @param array{search?: string, type?: string, include_inactive?: bool, inactive_only?: bool, parent_id?: int, posted?: bool} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = ChartOfAccount::query()
            ->with('parent:id,account_code,account_name')
            ->withCount('journalEntryLines as entries_count')
            ->orderBy('account_code');

        if (! empty($filters['inactive_only'])) {
            $query->where('is_active', false);
        } elseif (empty($filters['include_inactive'])) {
            $query->where('is_active', true);
        }

        if (! empty($filters['posted'])) {
            $query->has('journalEntryLines');
        }

        if (! empty($filters['type']) && $filters['type'] !== 'all') {
            $query->where('account_type', $filters['type']);
        }

        if (! empty($filters['parent_id']) && $filters['parent_id'] !== 'all') {
            $query->where('parent_account_id', $filters['parent_id']);
        }

        if (! empty($filters['search'])) {
            $term = '%' . $filters['search'] . '%';
            $query->where(function ($q) use ($term) {
                $q->where('account_code', 'ilike', $term)
                    ->orWhere('account_name', 'ilike', $term)
                    ->orWhere('account_type', 'ilike', $term)
                    ->orWhere('account_category', 'ilike', $term);
            });
        }

        $perPage = ! empty($filters['per_page']) ? min((int) $filters['per_page'], 200) : self::PER_PAGE;

        return $query->paginate($perPage);
    }

    public function create(User $user, array $data): ChartOfAccount
    {
        return DB::transaction(function () use ($user, $data) {
            $account = ChartOfAccount::create([
                'account_code' => $data['account_code'],
                'account_name' => $data['account_name'],
                'account_type' => $data['account_type'],
                'account_category' => $this->resolveCategory($data),
                'parent_account_id' => $data['parent_account_id'] ?? null,
                'description' => $data['description'] ?? null,
                'is_active' => filter_var($data['is_active'] ?? true, FILTER_VALIDATE_BOOL),
            ]);

            $this->audit($user, 'create', $account, "Created chart account {$account->account_code} — {$account->account_name}.");

            return $account->load('parent:id,account_code,account_name');
        });
    }

    public function update(User $user, ChartOfAccount $account, array $data): ChartOfAccount
    {
        return DB::transaction(function () use ($user, $account, $data) {
            $account->update([
                'account_code' => $data['account_code'],
                'account_name' => $data['account_name'],
                'account_type' => $data['account_type'],
                'account_category' => $this->resolveCategory($data),
                'parent_account_id' => $data['parent_account_id'] ?? null,
                'description' => $data['description'] ?? null,
                'is_active' => filter_var($data['is_active'] ?? $account->is_active, FILTER_VALIDATE_BOOL),
            ]);

            $this->audit($user, 'update', $account, "Updated chart account {$account->account_code} — {$account->account_name}.");

            return $account->fresh(['parent:id,account_code,account_name']);
        });
    }

    /**
     * Flips is_active. Deactivating the AR control account is blocked —
     * collections/disbursement posting resolves the receivable account by
     * name and only picks up active rows, so switching it off would break
     * posting. Every other account (including ones already carrying
     * postings) can be deactivated; it just stops being selectable for new
     * postings.
     */
    public function toggleActive(User $user, ChartOfAccount $account): ChartOfAccount
    {
        return DB::transaction(function () use ($user, $account) {
            $nextActive = ! $account->is_active;

            if (! $nextActive && $account->id === ChartOfAccount::arControlId()) {
                throw ValidationException::withMessages([
                    'account' => 'The Accounts Receivable control account cannot be deactivated — collections posting depends on it. Rename or archive other accounts as needed.',
                ]);
            }

            $account->update(['is_active' => $nextActive]);

            $this->audit($user, $nextActive ? 'restore' : 'archive', $account, ($nextActive ? 'Activated' : 'Deactivated') . " chart account {$account->account_code} — {$account->account_name}.");

            return $account->fresh(['parent:id,account_code,account_name']);
        });
    }

    /** Category fallback: derive a sensible default from the account type. */
    protected function resolveCategory(array $data): string
    {
        if (! empty($data['account_category'])) {
            return $data['account_category'];
        }

        return match ($data['account_type']) {
            'Asset' => 'Current Asset',
            'Liability' => 'Current Liability',
            'Equity' => 'Equity',
            'Revenue' => 'Operating Revenue',
            'Expense' => 'Operating Expense',
            default => 'General',
        };
    }

    protected function audit(User $user, string $action, ChartOfAccount $account, string $description): void
    {
        AuditLog::create([
            'user_id' => $user->id,
            'module' => 'ChartOfAccounts',
            'action' => $action,
            'record_id' => $account->id,
            'activity_description' => $description,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);
    }
}