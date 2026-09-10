<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePayrollDisbursementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'department_id' => ['required', 'integer', 'exists:departments,id'],
            'payroll_batch_number' => ['required', 'string', 'max:50', 'unique:disbursements,payroll_batch_number'],
            'payee' => ['required', 'string', 'max:255'],
            'pay_period_start' => ['required', 'date'],
            'pay_period_end' => ['required', 'date', 'after_or_equal:pay_period_start'],
            'payment_date' => ['required', 'date'],
            'employee_count' => ['required', 'integer', 'min:1'],
            'amount_paid' => ['required', 'numeric', 'min:0.01'],
            'currency' => ['nullable', 'string', 'size:3'],
            'payment_method' => ['nullable', 'string', 'in:Bank Transfer,Check,Cash,GCash'],
            'cash_account_id' => ['nullable', 'integer', 'exists:cash_accounts,id'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'remarks' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'department_id.required' => 'The department is required.',
            'department_id.exists' => 'The specified department does not exist in the database.',
            'payroll_batch_number.required' => 'The payroll batch number is required.',
            'payroll_batch_number.unique' => 'A disbursement voucher with this payroll batch number already exists.',
            'payee.required' => 'The payee description is required.',
            'pay_period_start.required' => 'The pay period start date is required.',
            'pay_period_end.required' => 'The pay period end date is required.',
            'pay_period_end.after_or_equal' => 'The pay period end date must be on or after the pay period start date.',
            'payment_date.required' => 'The payment date is required.',
            'employee_count.required' => 'The number of employees covered is required.',
            'employee_count.min' => 'Employee count must be at least 1.',
            'amount_paid.required' => 'The total payroll amount is required.',
            'amount_paid.min' => 'The payroll amount must be greater than zero.',
            'cash_account_id.exists' => 'The selected cash account does not exist.',
        ];
    }
}
