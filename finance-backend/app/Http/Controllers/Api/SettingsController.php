<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateLogoRequest;
use App\Http\Requests\UpdateSettingsRequest;
use App\Http\Resources\SettingsResource;
use App\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function __construct(protected SettingsService $settingsService)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => new SettingsResource($this->settingsService->get()),
        ]);
    }

    public function update(UpdateSettingsRequest $request): JsonResponse
    {
        // Map input names -> DB columns, but only include keys that were
        // actually sent. The Settings page saves branding and defaults
        // separately, and a partial update must not clobber the other
        // section with stale/empty values.
        $fields = [
            'name' => 'company_name',
            'tagline' => 'tagline',
            'address' => 'company_address',
            'email' => 'company_email',
            'phone' => 'company_phone',
            'tin' => 'company_tin',
            'currency' => 'currency',
            'baseCurrency' => 'base_currency',
            'exchangeRates' => 'exchange_rates',
            'fiscalYear' => 'fiscal_year',
            'defaultTaxRate' => 'default_tax_rate',
            'defaultPenaltyRate' => 'default_penalty_rate',
            'forecastMonths' => 'forecast_months',
            'dataRetentionDays' => 'data_retention_days',
        ];

        $data = [];
        foreach ($fields as $input => $column) {
            if ($request->has($input)) {
                $data[$column] = $request->validated($input);
            }
        }

        $setting = $this->settingsService->update($request->user(), $data);

        return response()->json([
            'success' => true,
            'message' => 'Settings updated successfully.',
            'data' => new SettingsResource($setting),
        ]);
    }

    public function updateLogo(UpdateLogoRequest $request): JsonResponse
    {
        $setting = $this->settingsService->updateLogo($request->user(), $request->file('logo'));

        return response()->json([
            'success' => true,
            'message' => 'Logo updated successfully.',
            'data' => new SettingsResource($setting),
        ]);
    }

    public function removeLogo(Request $request): JsonResponse
    {
        $setting = $this->settingsService->removeLogo($request->user());

        return response()->json([
            'success' => true,
            'message' => 'Logo removed successfully.',
            'data' => new SettingsResource($setting),
        ]);
    }
}