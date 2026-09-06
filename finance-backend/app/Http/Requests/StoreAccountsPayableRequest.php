<?php

namespace App\Http\Requests;

use App\Models\AccountsPayable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAccountsPayableRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Delegates to AccountsPayablePolicy::create() so role/permission
        // rules live in one place instead of being duplicated across
        // every entry point.
        return $this->user() !== null
            && $this->user()->can('create', AccountsPayable::class);
    }

    public function rules(): array
    {
        return [
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            // The expense/asset account this bill will debit once
            // approved (see AccountsPayableService::approve()). Required
            // up front rather than left until approval time, so approval
            // never fails partway through for a missing account.
            'account_id' => ['required', 'integer', Rule::exists('chart_of_accounts', 'id')],
            'invoice_number' => ['required', 'string', 'max:255', Rule::unique('accounts_payable', 'invoice_number')],
            'invoice_date' => ['nullable', 'date'],
            'due_date' => [
                'required',
                'date',
                function ($attribute, $value, $fail) {
                    // invoice_date defaults to today server-side (see
                    // AccountsPayableService::create()) when left blank,
                    // so only compare when the user actually submitted
                    // one — a plain after_or_equal:invoice_date rule
                    // would incorrectly reject a blank invoice_date.
                    if ($this->filled('invoice_date') && strtotime($value) < strtotime($this->input('invoice_date'))) {
                        $fail('The due date must be on or after the invoice date.');
                    }
                },
            ],
            // 'amount' here is the frontend's field name for original_amount —
            // mapped in the controller, not renamed here, so the form's
            // error keys line up with what Users.jsx-style forms expect.
            'amount' => ['required', 'numeric', 'min:0.01'],
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