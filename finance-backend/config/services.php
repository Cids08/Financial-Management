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
    // Direct-call engines (OpenAiAdvisorEngine / OpenAiRecommendationEngine).
    // Pointed at api.openai.com by default; set OPENAI_BASE_URL to switch
    // back to an OpenAI-compatible proxy (e.g. openrouter.ai/api/v1) and use
    // that provider's model naming (e.g. openai/gpt-4o-mini). The active
    // chain (RemoteAdvisorEngine / RemoteRecommendationEngine) does NOT read
    // this block — it calls the finance-aiservice microservice instead.
    'openai' => [
        'base_url' => env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
        'key' => env('OPENAI_API_KEY'),
        'advisor_model' => env('OPENAI_ADVISOR_MODEL', 'gpt-5-mini'),
        'recommendation_model' => env('OPENAI_RECOMMENDATION_MODEL', 'gpt-5-mini'),
        // OpenAI only accepts reasoning_effort on its reasoning models
        // (gpt-5, o3-*, etc.); for gpt-4o-mini leave it unset or the call
        // returns HTTP 400. Bump only when a reasoning model is configured.
        'reasoning_effort' => env('OPENAI_REASONING_EFFORT', ''),
        // OpenRouter attribution headers; ignored by api.openai.com, so
        // harmless to leave set either way.
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

    // Base URL of the AI advisor/recommendation microservice
    // (ai-advisor-service/) — RemoteAdvisorEngine and
    // RemoteRecommendationEngine both call this instead of OpenRouter
    // directly; the microservice itself owns the actual OpenAI-compatible
    // call. Token must match INTERNAL_SERVICE_TOKEN in that service's own
    // .env exactly, or every request gets rejected with a 401.
    'ai_advisor' => [
        'url' => env('AI_ADVISOR_SERVICE_URL', 'http://localhost:8002'),
        'token' => env('AI_ADVISOR_SERVICE_TOKEN'),
    ],

    'tesseract' => [
        'executable' => env('TESSERACT_PATH'),
    ],

];