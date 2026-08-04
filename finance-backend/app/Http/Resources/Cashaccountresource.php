<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CashAccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            // Matches CashAccounts.jsx's mock shape 1:1 — id -> cash_account_id,
            // deleted_at -> is_archived. `status` is already 'Active'/'Inactive'
            // on both sides, so it passes through unchanged (no is_active mapping
            // needed here, unlike collectors).
            'cash_account_id' => $this->id,
            'account_code'    => $this->account_code,
            'account_name'    => $this->account_name,
            'bank_name'       => $this->bank_name,
            'branch_name'     => $this->branch_name,
            'account_number'  => $this->account_number,
            'swift_code'      => $this->swift_code,
            'account_type'    => $this->account_type,
            'currency'        => $this->currency,
            'opening_balance' => (float) $this->opening_balance,
            'current_balance' => (float) $this->current_balance,
            'is_default'      => $this->is_default,
            'status'          => $this->status,
            'is_archived'     => $this->trashed(),
        ];
    }
}