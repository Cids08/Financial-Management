<?php

return [

    'driver' => env('HASH_DRIVER', 'bcrypt'),

    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => true,
    ],

    'argon' => [
        'memory'  => 65536,
        'threads' => 1,
        'time'    => 4,
        'verify'  => true,
    ],

];
