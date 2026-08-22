<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Budget extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'department_id',
        'budget_code',
        'budget_name',
        'budget_type',
        'fiscal_year',
        'allocated_amount',
        'used_amount',
        'remaining_amount',
        'warning_percentage',
        'start_date',
        'end_date',
        'status',
        'remarks',
        'created_by',
    ];

    protected $casts = [
        'allocated_amount' => 'decimal:2',
        'used_amount' => 'decimal:2',
        'remaining_amount' => 'decimal:2',
        'warning_percentage' => 'decimal:2',
        'start_date' => 'date',
        'end_date' => 'date',
        'approved_at' => 'datetime',
    ];

    // Only these are ever appended to the JSON payload — has_plan is what the
    // React approval gate reads (see hasBudgetPlan() in Budgets.jsx).
    protected $appends = ['has_plan'];

    /**
     * Every supporting document filed against this budget (plans, backup
     * spreadsheets, memos, etc). Keyed by convention through
     * supporting_documents.reference_type = 'budget', not a real foreign key,
     * since supporting_documents is a shared table across modules.
     */
    public function supportingDocuments()
    {
        return $this->hasMany(SupportingDocument::class, 'reference_id')
            ->where('reference_type', 'budget');
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /**
     * Whether a budget plan has been attached. This is the single source of
     * truth the approval flow checks — see BudgetService::approve().
     *
     * NOTE: calling this in a loop (e.g. an index listing) will N+1. Callers
     * that list many budgets should eager-load the count instead — see
     * BudgetService::forApprovalList() — rather than relying on this
     * accessor directly.
     */
    public function getHasPlanAttribute(): bool
    {
        if (array_key_exists('supporting_documents_count', $this->attributes)) {
            return ((int) $this->attributes['supporting_documents_count']) > 0;
        }

        return $this->supportingDocuments()->exists();
    }
}