<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Disbursement extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'source_type',
        'ap_id',
        'department_id',
        'cash_account_id',
        'voucher_number',
        'payee',
        'payment_date',
        'amount_paid',
        'currency',
        'payment_method',
        'reference_number',
        'remarks',
        'created_by',
        'updated_by',
        // Payroll-only fields — null for source_type = 'ap'.
        'payroll_batch_number',
        'pay_period_start',
        'pay_period_end',
        'employee_count',
    ];

    protected $casts = [
        'payment_date' => 'date',
        'released_date' => 'date',
        'amount_paid' => 'decimal:2',
        'approved_at' => 'datetime',
        'has_attachment' => 'boolean',
        'pay_period_start' => 'date',
        'pay_period_end' => 'date',
        'employee_count' => 'integer',
    ];

    public function accountsPayable()
    {
        return $this->belongsTo(AccountsPayable::class, 'ap_id');
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function cashAccount()
    {
        return $this->belongsTo(CashAccount::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function releaser()
    {
        return $this->belongsTo(User::class, 'released_by');
    }

    /**
     * Supporting documents (proof of payment, signed voucher, etc), same
     * convention as Budget::supportingDocuments() — keyed by
     * reference_type = 'disbursement', not a real foreign key.
     *
     * NOTE: this table also has a literal has_attachment boolean column,
     * which is denormalized against this relation. DisbursementService
     * keeps that column in sync on attach — see attachDocument().
     */
    public function supportingDocuments()
    {
        return $this->hasMany(SupportingDocument::class, 'reference_id')
            ->where('reference_type', 'disbursement');
    }

    public function isPayroll(): bool
    {
        return $this->source_type === 'payroll';
    }
}