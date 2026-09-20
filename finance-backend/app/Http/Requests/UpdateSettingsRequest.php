<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSettingsRequest extends FormRequest
{
    /**
     * Keep in sync with the frontend's CURRENCIES list (Settings.jsx).
     */
    protected const CURRENCIES = ['PHP', 'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'SGD'];

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // Both cards on the Settings page save independently, so every
            // field is `sometimes` — a request only needs to carry the
            // fields it intends to change. `required` still applies when a
            // field IS present, so blank required values are rejected.
            // Company Branding
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'tagline' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],

            // Regional & Financial Defaults
            'currency' => ['sometimes', 'required', 'string', 'in:' . implode(',', self::CURRENCIES)],
            // Currency conversion. Optional so older clients that don't
            // send them keep working; the controller only writes keys that
            // are actually present.
            'baseCurrency' => ['sometimes', 'nullable', 'string', 'in:' . implode(',', self::CURRENCIES)],
            'exchangeRates' => ['sometimes', 'nullable', 'array'],
            'exchangeRates.*' => ['nullable', 'numeric', 'min:0'],
            'fiscalYear' => ['sometimes', 'required', 'integer', 'min:2000', 'max:2100'],
            'defaultTaxRate' => ['sometimes', 'required', 'numeric', 'min:0', 'max:100'],
            'defaultPenaltyRate' => ['sometimes', 'required', 'numeric', 'min:0', 'max:100'],
            'forecastMonths' => ['sometimes', 'required', 'integer', 'min:6', 'max:60'],
        ];
    }
}