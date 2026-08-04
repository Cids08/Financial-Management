<?php

namespace App\Http\Resources;

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
            'logoUrl' => $this->company_logo ? asset('storage/' . ltrim($this->company_logo, '/')) : null,
            'currency' => $this->currency,
            'fiscalYear' => $this->fiscal_year,
            'defaultTaxRate' => $this->default_tax_rate,
            'forecastMonths' => $this->forecast_months,
        ];
    }
}