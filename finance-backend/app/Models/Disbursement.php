<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Disbursement extends Model
{
    use SoftDeletes;

    protected $fillable = [
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
    ];

    protected $casts = [
        'payment_date' => 'date',
        'released_date' => 'date',
        'amount_paid' => 'decimal:2',
        'approved_at' => 'datetime',
        'has_attachment' => 'boolean',
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
}