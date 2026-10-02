<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BudgetAccountAllocation extends Model
{
    protected $fillable = ['budget_id', 'account_id', 'allocated_amount'];
    protected $casts = ['allocated_amount' => 'decimal:2'];

    public function account()
    {
        return $this->belongsTo(ChartOfAccount::class, 'account_id')->withTrashed();
    }
}
