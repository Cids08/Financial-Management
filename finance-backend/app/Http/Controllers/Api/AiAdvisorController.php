<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AiAdvisorChatRequest;
use App\Models\AiAdvisorConversation;
use App\Services\AiAdvisorService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiAdvisorController extends Controller
{
    // Added directly here rather than assumed from the base Controller —
    // some Laravel setups (especially API-only skeletons) don't include
    // AuthorizesRequests on app/Http/Controllers/Controller.php by default,
    // which is what caused the "unknown method authorize()" errors.
    use AuthorizesRequests;

    public function __construct(private AiAdvisorService $advisor)
    {
    }

    /**
     * Start a new conversation for the authenticated user.
     */
    public function start(Request $request): JsonResponse
    {
        $conversation = AiAdvisorConversation::create([
            'user_id' => $request->user()->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $conversation,
        ], 201);
    }

    /**
     * Send a message in an existing conversation and get the advisor's reply.
     */
    public function chat(AiAdvisorChatRequest $request, AiAdvisorConversation $conversation): JsonResponse
    {
        $this->authorize('update', $conversation);

        $reply = $this->advisor->respond(
            conversation: $conversation,
            message: $request->string('message')->toString(),
        );

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => ['reply' => $reply],
        ]);
    }

    /**
     * Fetch a conversation with its full (non-compressed) message history.
     */
    public function show(AiAdvisorConversation $conversation): JsonResponse
    {
        $this->authorize('view', $conversation);

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $conversation->load('messages'),
        ]);
    }

    /**
     * List the authenticated user's conversations, most recent first.
     */
    public function index(Request $request): JsonResponse
    {
        $conversations = AiAdvisorConversation::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('updated_at')
            ->get();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $conversations,
        ]);
    }
}