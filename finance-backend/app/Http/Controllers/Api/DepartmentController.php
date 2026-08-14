<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDepartmentRequest;
use App\Http\Requests\UpdateDepartmentRequest;
use App\Http\Resources\DepartmentResource;
use App\Models\Department;
use App\Services\DepartmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DepartmentController extends Controller
{
    public function __construct(protected DepartmentService $departmentService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        // ?archived=1 mirrors the "Show archived" toggle on Roles.jsx/Users.jsx.
        $departments = $this->departmentService->list([
            'search' => $request->string('search')->toString(),
            'per_page' => $request->integer('per_page', 15),
            'archived' => $request->boolean('archived'),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => DepartmentResource::collection($departments),
            'meta' => [
                'current_page' => $departments->currentPage(),
                'last_page' => $departments->lastPage(),
                'total' => $departments->total(),
            ],
        ]);
    }

    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->departmentService->stats(),
        ]);
    }

    public function store(StoreDepartmentRequest $request): JsonResponse
    {
        $department = $this->departmentService->create($request->validated());
        $perPage = $request->integer('per_page', 15);
        $page = $this->departmentService->locatePage($department, $perPage);

        return response()->json([
            'success' => true,
            'message' => 'Department added successfully.',
            'data' => new DepartmentResource($department),
            'meta' => ['page' => $page],
        ], 201);
    }

    public function update(UpdateDepartmentRequest $request, Department $department): JsonResponse
    {
        $department = $this->departmentService->update($department, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Department updated successfully.',
            'data' => new DepartmentResource($department),
        ]);
    }

    public function archive(Department $department): JsonResponse
    {
        try {
            $this->departmentService->archive($department);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
                'data' => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Department archived successfully.',
            'data' => null,
        ]);
    }

    // {department} must resolve a soft-deleted record here, hence
    // withTrashed() on the route — same pattern as UserController/
    // RoleController's restore routes.
    public function restore(Department $department): JsonResponse
    {
        $this->departmentService->restore($department);

        return response()->json([
            'success' => true,
            'message' => 'Department restored successfully.',
            'data' => null,
        ]);
    }
}