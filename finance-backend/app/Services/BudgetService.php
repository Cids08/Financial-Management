<?php

namespace App\Services;

use App\Models\Budget;
use App\Models\SupportingDocument;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BudgetService
{
    public function stats(): array
    {
        $active = Budget::query()->whereNull('deleted_at');

        return [
            'total' => (clone $active)->count(),
            'pending' => (clone $active)->where('status', 'Pending')->count(),
            'allocated' => (float) (clone $active)->sum('allocated_amount'),
            'remaining' => (float) (clone $active)->sum('remaining_amount'),
            'archived' => Budget::onlyTrashed()->count(),
        ];
    }

    /**
     * `status` is the single approval-workflow field (Pending / Approved /
     * Rejected) — confirmed by UpdateBudgetRequest::authorize() checking
     * $budget->status !== 'Approved'. `archived` triggers onlyTrashed().
     */
    public function paginate(array $filters, int $perPage = 20)
    {
        $query = Budget::query()
            ->with(['department', 'creator', 'approver'])
            ->withCount(['supportingDocuments as supporting_documents_count']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['fiscal_year'])) {
            $query->where('fiscal_year', $filters['fiscal_year']);
        }

        if (! empty($filters['search'])) {
            $term = '%'.$filters['search'].'%';
            $query->where(function ($q) use ($term) {
                $q->where('budget_name', 'ilike', $term)
                    ->orWhere('budget_code', 'ilike', $term);
            });
        }

        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        return $query->latest('created_at')->paginate($perPage);
    }

    public function create(array $data, int $userId): Budget
    {
        return DB::transaction(fn () => Budget::create([
            ...$data,
            'used_amount' => 0,
            'remaining_amount' => $data['allocated_amount'],
            'status' => 'Pending',
            'created_by' => $userId,
        ]));
    }

    /**
     * $userId is accepted to match BudgetController's call signature, but
     * there is currently no `updated_by` column on budgets to record it
     * against — it's unused below. Add that column if you want to track
     * who last edited a budget; until then this param is a no-op.
     */
    public function update(Budget $budget, array $data, int $userId): Budget
    {
        if ($budget->status === 'Approved') {
            throw ValidationException::withMessages([
                'status' => 'An approved budget can no longer be edited.',
            ]);
        }

        return DB::transaction(function () use ($budget, $data) {
            $budget->update([
                'allocated_amount' => $data['allocated_amount'],
                'remaining_amount' => $data['allocated_amount'] - $budget->used_amount,
                'warning_percentage' => $data['warning_percentage'] ?? $budget->warning_percentage,
                'start_date' => $data['start_date'],
                'end_date' => $data['end_date'],
                'remarks' => $data['remarks'] ?? $budget->remarks,
            ]);

            return $budget->fresh();
        });
    }

    public function attachPlan(Budget $budget, UploadedFile $file, int $userId): SupportingDocument
    {
        $path = $file->store("budget-plans/{$budget->id}", 'local');

        return SupportingDocument::create([
            'reference_type' => 'budget',
            'reference_id' => $budget->id,
            'file_name' => basename($path),
            'original_name' => $file->getClientOriginalName(),
            'storage_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
            'uploaded_by' => $userId,
            'uploaded_at' => now(),
        ]);
    }

    public function approve(Budget $budget, int $approverId): Budget
    {
        if ($budget->status !== 'Pending') {
            throw ValidationException::withMessages(['status' => 'Only a pending budget can be approved.']);
        }

        if (! $budget->has_plan) {
            throw ValidationException::withMessages(['plan' => 'This budget cannot be approved until a budget plan is attached.']);
        }

        return DB::transaction(function () use ($budget, $approverId) {
            $budget->update(['status' => 'Approved', 'approved_by' => $approverId, 'approved_at' => now()]);

            return $budget->fresh();
        });
    }

    public function reject(Budget $budget, int $approverId, ?string $reason = null): Budget
    {
        if ($budget->status !== 'Pending') {
            throw ValidationException::withMessages(['status' => 'Only a pending budget can be rejected.']);
        }

        return DB::transaction(function () use ($budget, $approverId, $reason) {
            $budget->update([
                'status' => 'Rejected',
                'approved_by' => $approverId,
                'approved_at' => now(),
                'remarks' => $reason ?? $budget->remarks,
            ]);

            return $budget->fresh();
        });
    }

    public function archive(Budget $budget, int $userId): Budget
    {
        $budget->deleted_by = $userId;
        $budget->save();
        $budget->delete();

        return $budget;
    }

    /**
     * $userId is accepted to match BudgetController's call signature.
     * There's no `restored_by` column on budgets, so this only clears
     * deleted_by — the identity of who restored it isn't persisted
     * anywhere today. Add a column if that needs to be auditable.
     */
    public function restore(Budget $budget, int $userId): Budget
    {
        $budget->deleted_by = null;
        $budget->restore();

        return $budget->fresh();
    }
}