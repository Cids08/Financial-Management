<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class DepositBatch extends Model {
    protected $guarded = ['id'];
    protected $casts = ['receipt_snapshot'=>'array','deposit_date'=>'date','deposit_amount'=>'decimal:2','receipt_total'=>'decimal:2','confirmed_at'=>'datetime'];
    public function documents() { return $this->hasMany(SupportingDocument::class,'reference_id')->where('reference_type','deposit_batch'); }
    public function preparer() { return $this->belongsTo(User::class,'prepared_by'); }
    public function cashAccount() { return $this->belongsTo(CashAccount::class); }
}
