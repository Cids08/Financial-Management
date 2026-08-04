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
            // Company Branding
            'name' => ['required', 'string', 'max:255'],
            'tagline' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:500'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],

            // Regional & Financial Defaults
            'currency' => ['required', 'string', 'in:' . implode(',', self::CURRENCIES)],
            'fiscalYear' => ['required', 'integer', 'min:2000', 'max:2100'],
            'defaultTaxRate' => ['required', 'numeric', 'min:0', 'max:100'],
            'forecastMonths' => ['required', 'integer', 'min:1', 'max:60'],
        ];
    }
}