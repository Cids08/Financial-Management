<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FixedAssetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                       => $this->id,
            'asset_code'               => $this->asset_code,
            'asset_name'               => $this->asset_name,
            // Plain string per the ERD — the frontend's category dropdown
            // sends/receives this directly, no category_id/lookup needed.
            'asset_category'           => $this->asset_category,
            'serial_number'            => $this->serial_number,
            'brand'                    => $this->brand,
            'model'                    => $this->model,
            'location'                 => $this->location,
            'department_id'            => $this->department_id,
            'department_name'          => $this->whenLoaded('department', fn () => $this->department?->department_name),
            'purchase_date'            => $this->purchase_date?->toDateString(),
            'purchase_cost'            => (float) $this->purchase_cost,
            'salvage_value'            => (float) $this->salvage_value,
            'useful_life'              => $this->useful_life_years,
            'depreciation_method'      => $this->depreciation_method,
            'annual_depreciation'      => (float) $this->annual_depreciation,
            'accumulated_depreciation' => (float) $this->accumulated_depreciation,
            'book_value'               => (float) $this->book_value,
            'status'                   => $this->status,
            'remarks'                  => $this->remarks,
            'is_archived'              => $this->trashed(),
        ];
    }
}