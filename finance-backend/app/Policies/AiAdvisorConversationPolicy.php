<?php

namespace App\Policies;

use App\Models\AiAdvisorConversation;
use App\Models\User;

class AiAdvisorConversationPolicy
{
    public function view(User $user, AiAdvisorConversation $conversation): bool
    {
        return $user->id === $conversation->user_id;
    }

    public function update(User $user, AiAdvisorConversation $conversation): bool
    {
        return $user->id === $conversation->user_id;
    }
}