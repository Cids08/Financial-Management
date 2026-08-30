<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DisbursementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'disbursement_id' => $this->id,
            'source_type' => $this->source_type,
            'ap_id' => $this->ap_id,
            'invoice_number' => $this->whenLoaded('accountsPayable', fn () => $this->accountsPayable?->invoice_number),
            'department_id' => $this->department_id,
            'department_name' => $this->whenLoaded('department', fn () => $this->department?->department_name),
            'cash_account_id' => $this->cash_account_id,
            'cash_account_name' => $this->whenLoaded('cashAccount', fn () => $this->cashAccount?->account_name),
            'voucher_number' => $this->voucher_number,
            'payee' => $this->payee,
            'payment_date' => $this->payment_date?->toDateString(),
            'released_date' => $this->released_date?->toDateString(),
            'amount_paid' => (float) $this->amount_paid,
            'currency' => $this->currency,
            'payment_method' => $this->payment_method,
            'reference_number' => $this->reference_number,
            'status' => $this->status,
            'has_attachment' => (bool) $this->has_attachment,
            'remarks' => $this->remarks,
            'created_by' => $this->created_by,
            'created_by_name' => $this->whenLoaded('creator', fn () => trim(($this->creator?->first_name ?? '').' '.($this->creator?->last_name ?? ''))),
            'approved_by' => $this->approved_by,
            'approved_by_name' => $this->whenLoaded('approver', fn () => trim(($this->approver?->first_name ?? '').' '.($this->approver?->last_name ?? ''))),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'released_by' => $this->released_by,
            'released_by_name' => $this->whenLoaded('releaser', fn () => trim(($this->releaser?->first_name ?? '').' '.($this->releaser?->last_name ?? ''))),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            // Payroll-only — null on AP-sourced records.
            'payroll_batch_number' => $this->payroll_batch_number,
            'pay_period_start' => $this->pay_period_start?->toDateString(),
            'pay_period_end' => $this->pay_period_end?->toDateString(),
            'employee_count' => $this->employee_count,
        ];
    }
}