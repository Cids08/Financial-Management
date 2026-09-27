import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../utils/api'

// The active conversation id is kept in sessionStorage (keyed per user) so
// it survives sidebar navigation and page reloads inside the same tab, and
// never leaks across accounts. Storing per user id means a logout + login as
// a different person starts clean — no need to coordinate with the logout
// flow itself.
const storageKey = (userId) => (userId ? `fmsAiAdvisorConv:${userId}` : 'fmsAiAdvisorConv')

/**
 * Talks to the real /api/ai-advisor endpoints (AiAdvisorController). Lazily
 * creates one conversation on first send, then reuses it for every message
 * after  -  the backend handles memory/summarization, this hook just needs
 * to remember the conversation id and let the panel resume it later.
 *
 * userId (profile id) is optional purely to namespace sessionStorage; it is
 * NOT needed for any API call.
 */
export function useAiAdvisor(userId) {
  const conversationIdRef = useRef(null)
  const lastUserIdRef = useRef(null)
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [error, setError] = useState(null)

  const persist = useCallback(
    (id) => {
      const key = storageKey(userId)
      if (id == null) sessionStorage.removeItem(key)
      else sessionStorage.setItem(key, id)
    },
    [userId]
  )

  const adopt = useCallback(
    (id) => {
      conversationIdRef.current = id
      setActiveConversationId(id)
      persist(id)
    },
    [persist]
  )

  // Re-arm the conversation pointer whenever the user changes (login/logout),
  // restoring the stored id for that user from sessionStorage. Runs once on
  // mount for the initial user too.
  useEffect(() => {
    if (lastUserIdRef.current === userId) return
    lastUserIdRef.current = userId

    conversationIdRef.current = null
    setActiveConversationId(null)

    if (userId) {
      const stored = sessionStorage.getItem(storageKey(userId))
      if (stored) {
        conversationIdRef.current = stored
        setActiveConversationId(stored)
      }
    }
  }, [userId])

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current

    const res = await apiFetch('/api/ai-advisor/conversations', { method: 'POST' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to start a conversation.')

    adopt(json.data.id)
    return json.data.id
  }, [adopt])

  const sendMessage = useCallback(
    async (message) => {
      setError(null)
      try {
        const conversationId = await ensureConversation()

        const res = await apiFetch(`/api/ai-advisor/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.message || 'Failed to reach the AI advisor.')

        return json.data.reply
      } catch (err) {
        setError(err.message)
        throw err
      }
    },
    [ensureConversation]
  )

  // Start a brand-new conversation and make it the active one.
  const startNewConversation = useCallback(async () => {
    setError(null)
    const res = await apiFetch('/api/ai-advisor/conversations', { method: 'POST' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to start a conversation.')

    adopt(json.data.id)
    return json.data
  }, [adopt])

  // List the current user's conversations, most recent first.
  const listConversations = useCallback(async ({ archived = false } = {}) => {
    const res = await apiFetch(`/api/ai-advisor/conversations${archived ? '?archived=1' : ''}`)
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load conversations.')
    return json.data
  }, [])

  // Switch the active conversation to an existing one and fetch its full
  // message history in the panel shape ({ role, text, at }).
  const switchConversation = useCallback(
    async (id) => {
      setError(null)
      const res = await apiFetch(`/api/ai-advisor/conversations/${id}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load conversation.')

      adopt(id)
      const messages = (json.data.messages || []).map((m) => ({
        role: m.role,
        text: m.content,
        at: m.created_at,
      }))
      return { conversation: json.data, messages }
    },
    [adopt]
  )

  // Drop the persisted link to the active conversation (used when a stored
  // id turns out to be invalid, so the panel degrades to a fresh chat).
  const clearActiveConversation = useCallback(() => {
    conversationIdRef.current = null
    setActiveConversationId(null)
    persist(null)
  }, [persist])

  // Archive (soft-delete) an existing conversation.
  const archiveConversation = useCallback(async (id) => {
    const res = await apiFetch(`/api/ai-advisor/conversations/${id}/archive`, { method: 'PATCH' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive conversation.')
    return json.data
  }, [])

  // Restore a previously archived conversation.
  const restoreConversation = useCallback(async (id) => {
    const res = await apiFetch(`/api/ai-advisor/conversations/${id}/restore`, { method: 'PATCH' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore conversation.')
    return json.data
  }, [])

  // Permanently delete a conversation (removes it and all its messages).
  const deleteConversation = useCallback(async (id) => {
    const res = await apiFetch(`/api/ai-advisor/conversations/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to delete conversation.')
    return json.data
  }, [])

  return {
    sendMessage,
    startNewConversation,
    listConversations,
    switchConversation,
    clearActiveConversation,
    archiveConversation,
    restoreConversation,
    deleteConversation,
    activeConversationId,
    error,
  }
}