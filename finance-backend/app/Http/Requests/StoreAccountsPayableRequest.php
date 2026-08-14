<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAccountsPayableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'invoice_number' => ['required', 'string', 'max:255', Rule::unique('accounts_payable', 'invoice_number')],
            'invoice_date' => ['nullable', 'date'],
            'due_date' => ['required', 'date'],
            // 'amount' here is the frontend's field name for original_amount —
            // mapped in the controller, not renamed here, so the form's
            // error keys line up with what Users.jsx-style forms expect.
            'amount' => ['required', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:255'],
            'billing_address' => ['nullable', 'string', 'max:1000'],
            'description' => ['nullable', 'string', 'max:1000'],
            'reference_number' => ['nullable', 'string', 'max:255'],
            'purchase_order_no' => ['nullable', 'string', 'max:255'],
            'has_attachment' => ['nullable', 'boolean'],
            // UNCONFIRMED: accounts_payable may have its own CHECK
            // constraint on `status` (the DB default is 'Pending', which
            // isn't even in the frontend's Open/Partial/Paid/Overdue list —
            // see the SQL query in chat to confirm the real allowed set
            // before relying on this). Left as a loose string on purpose
            // so this doesn't silently reject a valid value; tighten to
            // Rule::in([...]) once confirmed.
            'status' => ['nullable', 'string', 'max:255'],
        ];
    }
}