<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PermissionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'permission_id' => $this->id,
            'permission_name' => $this->permission_name,
            'display_name' => $this->display_name,
            'module' => $this->module,
            'description' => $this->description,
        ];
    }
}