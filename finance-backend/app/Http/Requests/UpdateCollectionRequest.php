<?php

namespace App\Http\Requests;

use App\Models\Collection;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCollectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        /** @var Collection|null $collection */
        $collection = $this->route('collection');

        return [
            'cash_account_id' => ['sometimes', 'required', 'integer', 'exists:cash_accounts,id'],
            'receipt_number' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('collections', 'receipt_number')->ignore($collection?->id)],
            'or_number' => ['nullable', 'string', 'max:255'],
            'collection_date' => ['sometimes', 'required', 'date'],
            'deposit_date' => ['nullable', 'date', 'after_or_equal:collection_date'],
            'amount_received' => ['sometimes', 'required', 'numeric', 'min:0.01'],
            'payment_method' => ['sometimes', 'required', 'string', 'max:255'],
            'reference_number' => ['nullable', 'string', 'max:255'],
            'remarks' => ['nullable', 'string'],
        ];
    }

    /**
     * Once a collection is Confirmed it has already updated the AR
     * balance and the cash account — same reasoning as Expenses.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            /** @var Collection|null $collection */
            $collection = $this->route('collection');

            if ($collection && $collection->status === Collection::STATUS_CONFIRMED) {
                $validator->errors()->add(
                    'status',
                    'Confirmed collections cannot be edited directly.'
                );
            }
        });
    }
}