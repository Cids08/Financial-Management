import { useCallback, useRef, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Talks to the real /api/ai-advisor endpoints (AiAdvisorController). Lazily
 * creates one conversation per mount on first send, then reuses it for
 * every message after — the backend handles memory/summarization, this
 * hook just needs to remember the conversation id.
 *
 * Mirrors useAiRecommendations' apiFetch + { success, message, data }
 * envelope pattern exactly, rather than assuming an axios-style client.
 */
export function useAiAdvisor() {
  const conversationIdRef = useRef(null)
  const [error, setError] = useState(null)

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current

    const res = await apiFetch('/api/ai-advisor/conversations', { method: 'POST' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to start a conversation.')

    conversationIdRef.current = json.data.id
    return conversationIdRef.current
  }, [])

  const sendMessage = useCallback(async (message) => {
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
  }, [ensureConversation])

  return { sendMessage, error }
}