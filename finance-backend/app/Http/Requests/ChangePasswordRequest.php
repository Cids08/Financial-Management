<?php

namespace App\Http\Requests;

use App\Rules\NotPwnedPassword;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'current' => ['required', 'string'],
            'next' => ['required', 'string', 'min:8', new NotPwnedPassword()],
            'confirm' => ['required', 'string'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function ($validator) {
            if ($this->input('next') !== $this->input('confirm')) {
                $validator->errors()->add('confirm', 'New password and confirmation do not match.');
            }
        });
    }
}