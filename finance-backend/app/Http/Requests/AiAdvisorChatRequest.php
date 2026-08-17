<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AiAdvisorChatRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Actual ownership check happens in the controller via the
        // AiAdvisorConversationPolicy — this just confirms the user is authenticated,
        // which the auth:sanctum middleware already guarantees.
        return true;
    }

    public function rules(): array
    {
        return [
            'message' => ['required', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'message.required' => 'Please enter a message before sending.',
            'message.max' => 'Messages are limited to 1000 characters.',
        ];
    }
}