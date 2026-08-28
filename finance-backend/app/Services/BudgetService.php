<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\SupportingDocument;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class BudgetService
{
    /**
     * Paginated listing with the has_plan flag computed via a single query
     * (a correlated subquery), not one exists() query per row.
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

        return $query->latest('created_at')->paginate($perPage);
    }

    public function create(array $data, int $userId): Budget
    {
        return DB::transaction(function () use ($data, $userId) {
            $budget = Budget::create([
                ...$data,
                'used_amount' => 0,
                'remaining_amount' => $data['allocated_amount'],
                'status' => 'Pending',
                'created_by' => $userId,
            ]);

            AuditLog::create([
                'user_id' => $userId,
                'module' => 'Budgets',
                'action' => 'create',
                'record_id' => $budget->id,
                'activity_description' => "Created budget \"{$budget->budget_name}\" ({$budget->budget_code}).",
                'new_values' => $budget->only(['budget_name', 'budget_code', 'allocated_amount', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $budget;
        });
    }

    public function update(Budget $budget, array $data, int $userId): Budget
    {
        return DB::transaction(function () use ($budget, $data, $userId) {
            $original = $budget->only(['allocated_amount', 'warning_percentage', 'start_date', 'end_date']);

            // Allocated amount can shrink/grow before approval; remaining_amount
            // tracks the same delta since used_amount is always 0 pre-approval
            // (a budget cannot be spent against until it's approved).
            $budget->update([
                'allocated_amount' => $data['allocated_amount'],
                'remaining_amount' => $data['allocated_amount'] - $budget->used_amount,
                'warning_percentage' => $data['warning_percentage'] ?? $budget->warning_percentage,
                'start_date' => $data['start_date'],
                'end_date' => $data['end_date'],
                'remarks' => $data['remarks'] ?? $budget->remarks,
            ]);

            AuditLog::create([
                'user_id' => $userId,
                'module' => 'Budgets',
                'action' => 'update',
                'record_id' => $budget->id,
                'activity_description' => "Updated budget \"{$budget->budget_name}\" ({$budget->budget_code}).",
                'old_values' => $original,
                'new_values' => $budget->only(['allocated_amount', 'warning_percentage', 'start_date', 'end_date']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $budget->fresh();
        });
    }

    public function attachPlan(Budget $budget, \Illuminate\Http\UploadedFile $file, int $userId): SupportingDocument
    {
        $path = $file->store("budget-plans/{$budget->id}", 'local');

        $document = SupportingDocument::create([
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

        AuditLog::create([
            'user_id' => $userId,
            'module' => 'Budgets',
            'action' => 'attach_plan',
            'record_id' => $budget->id,
            'activity_description' => "Attached budget plan \"{$file->getClientOriginalName()}\" to \"{$budget->budget_name}\".",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $document;
    }

    /**
     * The rule this whole feature is about: a budget cannot be approved
     * until a plan document is attached. Enforced here — not just in the
     * UI — since this is the single place all approval requests pass
     * through, per the project's Controller -> Service -> Model flow.
     */
    public function approve(Budget $budget, int $approverId): Budget
    {
        if ($budget->status !== 'Pending') {
            throw ValidationException::withMessages([
                'status' => 'Only a pending budget can be approved.',
            ]);
        }

        if (! $budget->has_plan) {
            throw ValidationException::withMessages([
                'plan' => 'This budget cannot be approved until a budget plan is attached.',
            ]);
        }

        return DB::transaction(function () use ($budget, $approverId) {
            $budget->update([
                'status' => 'Approved',
                'approved_by' => $approverId,
                'approved_at' => now(),
            ]);

            AuditLog::create([
                'user_id' => $approverId,
                'module' => 'Budgets',
                'action' => 'approve',
                'record_id' => $budget->id,
                'activity_description' => sprintf(
                    'Approved budget "%s" (%s) — allocated %.2f.',
                    $budget->budget_name,
                    $budget->budget_code,
                    (float) $budget->allocated_amount
                ),
                'new_values' => [
                    'status' => 'Approved',
                    'allocated_amount' => (float) $budget->allocated_amount,
                ],
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $budget->fresh();
        });
    }

    public function reject(Budget $budget, int $approverId, ?string $reason = null): Budget
    {
        if ($budget->status !== 'Pending') {
            throw ValidationException::withMessages([
                'status' => 'Only a pending budget can be rejected.',
            ]);
        }

        return DB::transaction(function () use ($budget, $approverId, $reason) {
            $budget->update([
                'status' => 'Rejected',
                'approved_by' => $approverId,
                'approved_at' => now(),
                'remarks' => $reason ?? $budget->remarks,
            ]);

            AuditLog::create([
                'user_id' => $approverId,
                'module' => 'Budgets',
                'action' => 'reject',
                'record_id' => $budget->id,
                'activity_description' => $reason
                    ? "Rejected budget \"{$budget->budget_name}\" ({$budget->budget_code}). Reason: {$reason}"
                    : "Rejected budget \"{$budget->budget_name}\" ({$budget->budget_code}).",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $budget->fresh();
        });
    }

    public function archive(Budget $budget, int $userId): Budget
    {
        // SoftDeletes only manages deleted_at automatically — deleted_by has to
        // be set explicitly before the soft delete happens.
        $budget->deleted_by = $userId;
        $budget->save();
        $budget->delete();

        AuditLog::create([
            'user_id' => $userId,
            'module' => 'Budgets',
            'action' => 'archive',
            'record_id' => $budget->id,
            'activity_description' => "Archived budget \"{$budget->budget_name}\" ({$budget->budget_code}).",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $budget;
    }

    public function restore(Budget $budget, int $userId): Budget
    {
        $budget->deleted_by = null;
        $budget->restore();

        AuditLog::create([
            'user_id' => $userId,
            'module' => 'Budgets',
            'action' => 'restore',
            'record_id' => $budget->id,
            'activity_description' => "Restored budget \"{$budget->budget_name}\" ({$budget->budget_code}).",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $budget->fresh();
    }
}