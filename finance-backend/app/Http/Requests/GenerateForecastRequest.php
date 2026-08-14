<?php

namespace App\Http\Requests;

use App\Services\FinancialForecastService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GenerateForecastRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'forecast_type' => ['required', 'string', Rule::in(FinancialForecastService::FORECAST_TYPES)],
            'horizon_key' => ['required', 'string', Rule::in(array_keys(FinancialForecastService::HORIZON_LABELS))],
        ];
    }
}