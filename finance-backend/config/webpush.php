<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Web Push / VAPID
    |--------------------------------------------------------------------------
    |
    | VAPID keys are the identity used when the backend signs push
    | notifications sent through the browser's push service (FCM,
    | Mozilla autopush, Web Push protocol). Generate a pair with:
    |
    |     openssl ecparam -name prime256v1 -genkey -noout
    |     openssl ec -in <key> -text -noout   # take priv: and pub: hex
    |
    | then base64url-encode both (no padding). VAPID_SUBJECT should be a
    | mailto: address or https: URL that identifies this app.
    |
    | When the keys are empty the app still works — pushes are simply
    | skipped (the in-app notifications and filtering are unaffected).
    |
    */

    'vapid' => [
        'public_key'  => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
        'subject'     => env('VAPID_SUBJECT', 'mailto:noreply@localhost'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Notification payload defaults
    |--------------------------------------------------------------------------
    */

    'default_ttl'     => 86400,       // seconds a queued push stays valid
    'default_timeout' => 30,
];