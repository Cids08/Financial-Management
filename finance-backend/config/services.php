<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Currently pointed at OpenRouter (funded), not api.openai.com directly
    // (out of credits). Both are OpenAI-compatible, so OpenAiAdvisorEngine /
    // OpenAiRecommendationEngine needed zero code changes for this swap —
    // only base_url, key, and model naming convention changed here.
    // To switch back to real OpenAI later: OPENAI_BASE_URL=https://api.openai.com/v1,
    // a real OpenAI key, and plain model names (e.g. gpt-5-mini instead of
    // openai/gpt-5-mini).
    'openai' => [
        'base_url' => env('OPENAI_BASE_URL', 'https://openrouter.ai/api/v1'),
        'key' => env('OPENAI_API_KEY'),
        'advisor_model' => env('OPENAI_ADVISOR_MODEL', 'openai/gpt-oss-120b:free'),
        'recommendation_model' => env('OPENAI_RECOMMENDATION_MODEL', 'openai/gpt-oss-120b:free'),
        // OpenRouter-specific, optional but recommended by their docs for
        // attribution/rankings — ignored entirely by real OpenAI if you
        // switch back, so safe to leave set either way.
        'referer' => env('OPENAI_HTTP_REFERER', 'http://localhost'),
        'title' => env('OPENAI_APP_TITLE', 'Financial Management System'),
    ],

    // Base URL of the Python ARIMA/FastAPI service (finance-forecasting/).
    // NOT currently in your .env — add it there. No default fallback on
    // purpose: PythonArimaForecastEngine throws a clear error instead of
    // silently hitting an empty URL if this is missing.
    'forecast_service' => [
        'base_url' => env('FORECAST_SERVICE_URL'),
    ],

    'tesseract' => [
        'executable' => env('TESSERACT_PATH'),
    ],

];