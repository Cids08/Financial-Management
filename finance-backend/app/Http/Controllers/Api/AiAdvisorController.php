<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AiAdvisorChatRequest;
use App\Models\AiAdvisorConversation;
use App\Models\AuditLog;
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
     * Pass ?archived=1 to list archived (soft-deleted) conversations instead
     * of the active default set.
     */
    public function index(Request $request): JsonResponse
    {
        $query = AiAdvisorConversation::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('updated_at');

        if ($request->boolean('archived')) {
            $query->onlyTrashed();
        }

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $query->get(),
        ]);
    }

    /**
     * Soft-deletes the conversation (archive, not destroy) — same
     * convention as AiRecommendationController::archive(): the row stays in
     * the DB for audit purposes, it just drops out of the active list.
     */
    public function archive(Request $request, AiAdvisorConversation $conversation): JsonResponse
    {
        $this->authorize('update', $conversation);

        $conversation->delete();

        AuditLog::create([
            'user_id' => $request->user()->id,
            'module' => 'AI Advisor',
            'action' => 'archive',
            'record_id' => $conversation->id,
            'activity_description' => 'Archived AI advisor conversation #'.$conversation->id.' ('.($conversation->title ?: 'untitled').').',
            'new_values' => null,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Conversation archived.',
            'data' => $conversation,
        ]);
    }

    /**
     * Restores a previously archived conversation. Route uses ->withTrashed()
     * (see routes/api.php) so the {conversation} route binding resolves
     * trashed rows too — a normal lookup would 404 before this is reached.
     */
    public function restore(Request $request, AiAdvisorConversation $conversation): JsonResponse
    {
        $this->authorize('update', $conversation);

        $conversation->restore();

        AuditLog::create([
            'user_id' => $request->user()->id,
            'module' => 'AI Advisor',
            'action' => 'restore',
            'record_id' => $conversation->id,
            'activity_description' => 'Restored AI advisor conversation #'.$conversation->id.' ('.($conversation->title ?: 'untitled').').',
            'new_values' => null,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Conversation restored.',
            'data' => $conversation,
        ]);
    }

    /**
     * Permanently deletes the conversation and (via the DB-level
     * cascadeOnDelete on the messages FK) all of its messages.
     */
    public function destroy(Request $request, AiAdvisorConversation $conversation): JsonResponse
    {
        $this->authorize('delete', $conversation);

        $id = $conversation->id;
        $title = $conversation->title;

        AuditLog::create([
            'user_id' => $request->user()->id,
            'module' => 'AI Advisor',
            'action' => 'delete',
            'record_id' => $id,
            'activity_description' => 'Permanently deleted AI advisor conversation #'.$id.' ('.($title ?: 'untitled').').',
            'new_values' => null,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $conversation->forceDelete();

        return response()->json([
            'success' => true,
            'message' => 'Conversation deleted.',
            'data' => ['id' => $id],
        ]);
    }
}