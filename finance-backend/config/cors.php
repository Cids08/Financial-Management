<?php

return [

    'paths' => ['api/*', 'broadcasting/auth'],

    'allowed_methods' => ['*'],

    // Always allow the known production frontend + local dev origins.
    // CORS_ALLOWED_ORIGINS can add extra origins (comma-separated) on top
    // of this base list — useful for staging environments.
    // array_filter() removes any empty strings that come from splitting
    // a blank env value, so a misconfigured CORS_ALLOWED_ORIGINS='' on
    // HostForge won't accidentally wipe out the base list.
    'allowed_origins' => array_values(array_unique(array_merge(
        [
            'http://localhost:5173',
            'http://localhost:3000',
            'https://fms.alibaton-ph.com',
        ],
        array_filter(explode(',', env('CORS_ALLOWED_ORIGINS', '')))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];