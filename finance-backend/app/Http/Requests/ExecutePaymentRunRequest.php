<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ExecutePaymentRunRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        return $user !== null && (
            $user->hasPermission('ap.approve') ||
            $user->hasPermission('ap.manage') ||
            $user->hasPermission('disbursements.approve') ||
            $user->hasPermission('disbursements.manage') ||
            $user->hasAnyRole(['admin', 'super-admin'])
        );
    }

    public function rules(): array
    {
        return [
            'cash_account_id'         => ['required', 'integer', 'exists:cash_accounts,id'],
            'payment_method'          => ['required', 'string', 'in:Bank Transfer,Check,Cash,Credit Card,GCash'],
            'payment_date'            => ['required', 'date'],
            'department_id'           => ['nullable', 'integer', 'exists:departments,id'],
            'proposals'               => ['required', 'array', 'min:1'],
            'proposals.*.ap_id'       => ['required', 'integer', 'exists:accounts_payable,id'],
            'proposals.*.amount_to_pay' => ['required', 'numeric', 'min:0.01'],
            'proposals.*.remarks'     => ['nullable', 'string', 'max:255'],
            'proposals.*.reference_number' => ['nullable', 'string', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'cash_account_id.required' => 'Please select the bank or cash account to pay from.',
            'cash_account_id.exists'   => 'The selected cash account is invalid.',
            'payment_method.required'  => 'Please select a payment method.',
            'payment_date.required'    => 'Payment date is required.',
            'proposals.required'       => 'Please select at least one bill to disburse.',
            'proposals.min'            => 'Please select at least one bill to disburse.',
            'proposals.*.ap_id.exists' => 'One or more selected bills are invalid.',
            'proposals.*.amount_to_pay.min' => 'Payment amount must be greater than zero.',
        ];
    }
}
