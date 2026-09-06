<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;


Broadcast::channel('user.{id}', function (User $user, $id) {
    return (int) $user->id === (int) $id;
});


Broadcast::channel('collections', function (User $user) {
    return $user->hasPermission('collections.view');
});