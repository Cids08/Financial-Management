<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCollectorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $collectorId = $this->route('collector')?->id;

        return [
            'employee_no'      => ['required', 'string', 'max:255', Rule::unique('collectors', 'employee_no')->ignore($collectorId)],
            'first_name'       => ['required', 'string', 'max:255'],
            'middle_name'      => ['nullable', 'string', 'max:255'],
            'last_name'        => ['required', 'string', 'max:255'],
            'phone_number'     => ['nullable', 'string', 'max:20'],
            'email'            => ['nullable', 'email', 'max:255'],
            'assigned_area'    => ['nullable', 'string', 'max:255'],
            'service_area_id'  => ['nullable', 'integer', 'exists:service_areas,id'],
            'commission_rate'  => ['nullable', 'numeric', 'min:0', 'max:100'],
            'monthly_target'   => ['nullable', 'numeric', 'min:0'],
            'is_active'        => ['sometimes', 'boolean'],
            // New — links this collector record to a login account.
            // ->ignore($collectorId) matters here specifically: without
            // it, re-saving a collector that's already linked to user_id
            // X would fail uniqueness against its own existing row.
            'user_id'          => ['nullable', 'integer', 'exists:users,id', Rule::unique('collectors', 'user_id')->ignore($collectorId)],
        ];
    }
}