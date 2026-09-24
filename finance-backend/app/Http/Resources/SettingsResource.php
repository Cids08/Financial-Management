<?php

namespace App\Http\Resources;

use App\Support\FileStorage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SettingsResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'name' => $this->company_name,
            'tagline' => $this->tagline,
            'address' => $this->company_address,
            'email' => $this->company_email,
            'phone' => $this->company_phone,
            'logoUrl' => FileStorage::signedUrl($this->company_logo, FileStorage::IMAGE_TTL_SECONDS),
            'currency' => $this->currency,
            'baseCurrency' => $this->base_currency,
            'exchangeRates' => $this->exchange_rates ?? (object) [],
            'fiscalYear' => $this->fiscal_year,
            'defaultTaxRate' => $this->default_tax_rate,
            'defaultPenaltyRate' => $this->default_penalty_rate,
            'forecastMonths' => $this->forecast_months,
            'dataRetentionDays' => $this->data_retention_days ?? 3650,
        ];
    }
}