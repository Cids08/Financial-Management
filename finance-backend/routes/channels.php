<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;


Broadcast::channel('user.{id}', function (User $user, $id) {
    return (int) $user->id === (int) $id;
});


Broadcast::channel('collections', function (User $user) {
    return $user->hasPermission('collections.view');
});

// Shared realtime refetch-signal channel. Payloads are module/action slugs
// only (no data rows) — subscribers re-fetch through the API, which applies
// its own permission checks. Any authenticated user may join.
Broadcast::channel('data', function (User $user) {
    return $user !== null;
});