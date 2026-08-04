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
        $setting = $this->settingsService->update($request->user(), [
            'company_name' => $request->validated('name'),
            'tagline' => $request->validated('tagline'),
            'company_address' => $request->validated('address'),
            'company_email' => $request->validated('email'),
            'company_phone' => $request->validated('phone'),
            'currency' => $request->validated('currency'),
            'fiscal_year' => $request->validated('fiscalYear'),
            'default_tax_rate' => $request->validated('defaultTaxRate'),
            'forecast_months' => $request->validated('forecastMonths'),
        ]);

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