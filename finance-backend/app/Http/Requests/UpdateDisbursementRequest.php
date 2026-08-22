<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDisbursementRequest extends FormRequest
{
    public function authorize(): bool
    {
        $disbursement = $this->route('disbursement');

        return $disbursement->status === 'Pending';
    }

    public function rules(): array
    {
        return [
            'cash_account_id' => ['required', 'integer', 'exists:cash_accounts,id'],
            'payee' => ['required', 'string', 'max:255'],
            'payment_date' => ['required', 'date'],
            'amount_paid' => ['required', 'numeric', 'min:0.01'],
            'currency' => ['required', 'string', 'max:10'],
            'payment_method' => ['required', 'string', 'max:50'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'remarks' => ['nullable', 'string', 'max:2000'],
        ];
    }
}