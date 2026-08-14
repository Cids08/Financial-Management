<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ServiceArea;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ServiceAreaController extends Controller
{
    // No soft-delete column on this table in the ERD, and collectors
    // reference it with NO ACTION on delete — deliberately no
    // archive/delete endpoint here to avoid a raw DB error the moment
    // a collector references the row. Add one once you decide how
    // in-use service areas should be retired.
    public function index(Request $request): JsonResponse
    {
        $areas = ServiceArea::query()->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $areas,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:50', 'unique:service_areas,code'],
        ]);

        $area = ServiceArea::create($data);

        return response()->json([
            'success' => true,
            'message' => 'Service area created.',
            'data' => $area,
        ], 201);
    }

    public function update(Request $request, ServiceArea $serviceArea): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => ['sometimes', 'required', 'string', 'max:50', Rule::unique('service_areas', 'code')->ignore($serviceArea->id)],
        ]);

        $serviceArea->update($data);

        return response()->json([
            'success' => true,
            'message' => 'Service area updated.',
            'data' => $serviceArea,
        ]);
    }
}