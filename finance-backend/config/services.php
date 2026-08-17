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

    'openai' => [
        'key' => env('OPENAI_API_KEY'),
        'advisor_model' => env('OPENAI_ADVISOR_MODEL', 'gpt-5-mini'),
        'recommendation_model' => env('OPENAI_RECOMMENDATION_MODEL', 'gpt-5-mini'),
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