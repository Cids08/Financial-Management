<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTitleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $titleId = $this->route('title')?->id;

        return [
            'name' => ['required', 'string', 'max:255', Rule::unique('titles', 'name')->ignore($titleId)],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}