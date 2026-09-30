import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, X, History, SquarePen, Archive, Trash2, RotateCcw } from 'lucide-react'
import Button from './Button'
import ChatMessageBubble from './ChatMessageBubble'
import Modal from './Modal'
import Tooltip from './Tooltip'
import { useAiAdvisor } from '../hooks/useAiAdvisor'
import { useProfile } from '../hooks/useProfile'

const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-surface text-ink!
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)' }

const SUGGESTED_PROMPTS = [
  'Which forecast has the lowest confidence?',
  'How can we reduce expenses?',
  'Summarize the risk alerts',
  'What should we do about collections?',
]

// Recurring "still here" nudge while minimized: a different short line pops
// up every TEASER_INTERVAL_MS, stays for TEASER_VISIBLE_MS, then hides until
// the next tick. Keeps going only while the panel is minimized  -  stops the
// moment the user opens it, and the interval is cleared on unmount too.
const TEASER_FIRST_DELAY_MS = 1200
const TEASER_INTERVAL_MS = 8000
const TEASER_VISIBLE_MS = 4500

const TEASER_MESSAGES = [
  'Need a hand with cash flow or forecasts?',
  "I'm still here if you have questions!",
  'Curious about your latest recommendations?',
  'Ask me anything about your forecasts.',
  'Want a quick summary of the risk alerts?',
]

// Same fallback the header uses when profile.name isn't available yet
// (see Header.jsx: `profile?.name || 'User'`), so the greeting never
// shows "Hi undefined" during the brief window before useProfile resolves.
function buildGreeting(firstName) {
  const name = firstName ? `Hi ${firstName}` : 'Hi'
  return {
    role: 'assistant',
    text: `${name}, I'm your AI financial advisor. Ask me about any of the recommendations on this page  -  cash flow, expenses, revenue, or budget.`,
    at: new Date().toISOString(),
  }
}

// ChatGPT-style "x ago" label for the history list; falls back to a plain
// date for anything older than a week so the timestamp stays readable.
function formatRelativeTime(iso) {
  if (!iso) return ''
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function AdvisorChatPanel() {
  // Same hook Header.jsx uses for "Good afternoon, Carl"  -  one source of
  // truth for the user's name, no separate fetch here.
  const { profile } = useProfile()
  const firstName = profile?.name?.split(' ')[0]

  const {
    sendMessage: sendToAdvisor,
    startNewConversation,
    listConversations,
    switchConversation,
    clearActiveConversation,
    archiveConversation,
    restoreConversation,
    deleteConversation,
    activeConversationId,
  } = useAiAdvisor(profile?.id)

  const [open, setOpen] = useState(false)
  const [teaserText, setTeaserText] = useState(null)
  const [messages, setMessages] = useState(() => [buildGreeting(firstName)])
  const [chatInput, setChatInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [conversations, setConversations] = useState([])
  const [archivedConversations, setArchivedConversations] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [hydrating, setHydrating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const scrollRef = useRef(null)
  const lastTeaserIndexRef = useRef(-1)
  const hasShownFirstTeaserRef = useRef(false)
  const hydratedRef = useRef(false)

  const pickTeaserMessage = () => {
    if (!hasShownFirstTeaserRef.current) {
      hasShownFirstTeaserRef.current = true
      return firstName ? `Hi ${firstName}! Need a hand with cash flow or forecasts?` : 'Need a hand with cash flow or forecasts?'
    }
    if (TEASER_MESSAGES.length === 1) return TEASER_MESSAGES[0]
    let index = Math.floor(Math.random() * TEASER_MESSAGES.length)
    // Avoid showing the exact same line twice back to back.
    while (index === lastTeaserIndexRef.current) {
      index = Math.floor(Math.random() * TEASER_MESSAGES.length)
    }
    lastTeaserIndexRef.current = index
    return TEASER_MESSAGES[index]
  }

  // Profile loads asynchronously, so the very first render (before
  // useProfile resolves) won't have a name yet. Once it arrives, update
  // the greeting in place, but ONLY while it's still the sole message  - 
  // never touch it after the user has started actually chatting.
  useEffect(() => {
    if (firstName) {
      setMessages((prev) => (prev.length === 1 && prev[0].role === 'assistant' ? [buildGreeting(firstName)] : prev))
    }
  }, [firstName])

  // Resume the stored conversation for this user, if one exists: fetch its
  // full message history from the backend and render it instead of the
  // greeting. Runs exactly once per mount (ref guard); switching chats from
  // the history sidebar goes through selectConversation instead.
  useEffect(() => {
    if (!profile?.id || hydratedRef.current) return
    hydratedRef.current = true

    if (activeConversationId) {
      setHydrating(true)
      switchConversation(activeConversationId)
        .then(({ messages: history }) => {
          if (history.length) setMessages(history)
        })
        .catch(() => clearActiveConversation())
        .finally(() => setHydrating(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, activeConversationId])

  // Minimized-state teaser: pop up a small rotating speech bubble near the
  // circle on a recurring cadence, so the advisor keeps reminding the user
  // it's there without forcing the panel open. Runs on a first-delay +
  // repeating-interval pattern, entirely paused while the panel is open,
  // and fully cleaned up on unmount so it never leaks a timer.
  useEffect(() => {
    if (open) {
      setTeaserText(null)
      return
    }

    let hideTimer
    const showOnce = () => {
      setTeaserText(pickTeaserMessage())
      hideTimer = setTimeout(() => setTeaserText(null), TEASER_VISIBLE_MS)
    }

    const firstTimer = setTimeout(showOnce, TEASER_FIRST_DELAY_MS)
    const interval = setInterval(showOnce, TEASER_INTERVAL_MS)

    return () => {
      clearTimeout(firstTimer)
      clearTimeout(hideTimer)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isThinking, open])

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    // Guard against firing a second request while one is still pending  - 
    // previously nothing stopped overlapping sends while isThinking was true.
    if (!trimmed || isThinking) return

    const userMsg = { role: 'user', text: trimmed, at: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setIsThinking(true)
    try {
      const reply = await sendToAdvisor(trimmed)
      setMessages((prev) => [...prev, { role: 'assistant', text: reply, at: new Date().toISOString() }])
    } catch (err) {
      // sendToAdvisor already sets its own `error` state internally and
      // re-throws, so this catch is the single place that surfaces it, as
      // a chat bubble. A separate banner would just show the same failure
      // twice. err.message carries specifics from the hook (e.g. "Failed
      // to start a conversation." vs a network error) when available.
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: err?.message || 'Sorry, the AI advisor is unavailable right now. Please try again in a moment.',
        at: new Date().toISOString(),
      }])
    } finally {
      setIsThinking(false)
    }
  }

  const handleChatSubmit = (e) => {
    e.preventDefault()
    sendMessage(chatInput)
  }

  const openChat = () => {
    setTeaserText(null)
    setOpen(true)
  }

  const toggleHistory = () => {
    setHistoryOpen((prev) => {
      const next = !prev
      if (next) refreshHistory()
      return next
    })
  }

  const refreshHistory = () => {
    setHistoryLoading(true)
    Promise.all([listConversations(), listConversations({ archived: true })])
      .then(([active, archived]) => {
        setConversations(active)
        setArchivedConversations(archived)
      })
      .catch(() => {
        setConversations([])
        setArchivedConversations([])
      })
      .finally(() => setHistoryLoading(false))
  }

  // If the active conversation is archived or deleted, drop the persisted
  // link and reset the thread so the next send starts a fresh chat.
  const handleActiveChanged = () => {
    clearActiveConversation()
    setMessages([buildGreeting(firstName)])
  }

  const handleArchive = async (conversation) => {
    try {
      await archiveConversation(String(conversation.id))
      if (isActiveConversation(String(conversation.id))) handleActiveChanged()
      refreshHistory()
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: err?.message || 'Could not archive that conversation.', at: new Date().toISOString() },
      ])
    }
  }

  const handleRestore = async (conversation) => {
    try {
      await restoreConversation(String(conversation.id))
      refreshHistory()
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: err?.message || 'Could not restore that conversation.', at: new Date().toISOString() },
      ])
    }
  }

  const handleDelete = (conversation) => {
    setDeleteError('')
    setDeleteTarget(conversation)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteConversation(String(deleteTarget.id))
      if (isActiveConversation(String(deleteTarget.id))) handleActiveChanged()
      setDeleteTarget(null)
      refreshHistory()
    } catch (err) {
      setDeleteError(err?.message || 'Could not delete that conversation.')
    } finally {
      setDeleting(false)
    }
  }

  const closePanel = () => {
    setOpen(false)
    setHistoryOpen(false)
  }

  const selectConversation = async (id) => {
    setHistoryOpen(false)
    setHydrating(true)
    try {
      const { messages: history } = await switchConversation(id)
      setMessages(history.length ? history : [buildGreeting(firstName)])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err?.message || 'Could not load that conversation. Please try again.',
          at: new Date().toISOString(),
        },
      ])
    } finally {
      setHydrating(false)
    }
  }

  const newChat = async () => {
    setHistoryOpen(false)
    try {
      await startNewConversation()
      setMessages([buildGreeting(firstName)])
    } catch (err) {
      // startNewConversation throws with a user-facing message; surface it
      // as a chat bubble the same way sendMessage failure does below.
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err?.message || 'Sorry, the AI advisor is unavailable right now. Please try again in a moment.',
          at: new Date().toISOString(),
        },
      ])
    }
  }

  const isActiveConversation = (id) => id === activeConversationId

  return (
    <div className="fixed bottom-5 right-5 z-60 flex flex-col items-end gap-3">
      {open && (
        <div
          className={`${
            historyOpen ? 'w-[min(38rem,calc(100vw-2.5rem))]' : 'w-[min(26rem,calc(100vw-2.5rem))]'
          } h-[min(40rem,calc(100vh-6rem))] rounded-2xl border border-border/60 bg-surface
            shadow-2xl shadow-black/20 dark:shadow-black/50 flex overflow-hidden animate-fadeIn`}
        >
          {historyOpen && (
            <div className="w-64 shrink-0 border-r border-border/50 bg-bg/70 flex flex-col min-h-0">
              <div className="flex items-center justify-between px-3 pt-3 pb-2.5 border-b border-border/50">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Chat History</p>
                <button
                  type="button"
                  onClick={toggleHistory}
                  aria-label="Close chat history"
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-ink/8 text-muted hover:bg-ink/15 hover:text-ink transition-all duration-150"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="flex gap-1 px-3 pt-2.5 pb-2 border-b border-border/50">
                <button
                  type="button"
                  onClick={() => setShowArchived(false)}
                  aria-pressed={!showArchived}
                  className={`flex-1 text-xs font-semibold rounded-lg px-2 py-1.5 transition-all duration-150 ${
                    !showArchived ? 'bg-primary text-black shadow-xs' : 'text-muted hover:bg-bg hover:text-ink'
                  }`}
                >
                  Active ({conversations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowArchived(true)}
                  aria-pressed={showArchived}
                  className={`flex-1 text-xs font-semibold rounded-lg px-2 py-1.5 transition-all duration-150 ${
                    showArchived ? 'bg-primary text-black shadow-xs' : 'text-muted hover:bg-bg hover:text-ink'
                  }`}
                >
                  Archived ({archivedConversations.length})
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                {historyLoading ? (
                  <p className="text-xs text-muted px-2 py-2">Loading conversations...</p>
                ) : showArchived ? (
                  archivedConversations.length === 0 ? (
                    <p className="text-xs text-muted px-2 py-2">Nothing archived yet.</p>
                  ) : (
                    archivedConversations.map((c) => (
                      <div
                        key={c.id}
                        className={`group flex items-center rounded-lg transition-colors duration-150 ${
                          isActiveConversation(String(c.id)) ? 'bg-primary/20 text-ink' : 'hover:bg-bg text-ink'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => selectConversation(String(c.id))}
                          aria-current={isActiveConversation(String(c.id)) ? 'true' : undefined}
                          className="flex-1 min-w-0 text-left px-2 py-2"
                        >
                          <p className="text-sm font-medium truncate text-ink">{c.title || 'New chat'}</p>
                          <p className="text-[11px] text-muted">{formatRelativeTime(c.updated_at)}</p>
                        </button>
                        <div className="flex items-center gap-0.5 pr-1.5 pl-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                          <Tooltip label="Restore conversation" position="bottom" align="start">
                            <button
                              type="button"
                              onClick={() => handleRestore(c)}
                              aria-label="Restore conversation"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              <RotateCcw size={12} />
                            </button>
                          </Tooltip>
                          <Tooltip label="Delete permanently" position="bottom" align="start">
                            <button
                              type="button"
                              onClick={() => handleDelete(c)}
                              aria-label="Delete conversation"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-red-500/15 hover:text-red-600 transition-colors duration-150"
                            >
                              <Trash2 size={12} />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    ))
                  )
                ) : conversations.length === 0 ? (
                  <p className="text-xs text-muted px-2 py-2">No past conversations yet.</p>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      className={`group flex items-center rounded-lg transition-colors duration-150 ${
                        isActiveConversation(String(c.id)) ? 'bg-primary/20 text-ink' : 'hover:bg-bg text-ink'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectConversation(String(c.id))}
                        aria-current={isActiveConversation(String(c.id)) ? 'true' : undefined}
                        className="flex-1 min-w-0 text-left px-2 py-2"
                      >
                        <p className="text-sm font-medium truncate text-ink">{c.title || 'New chat'}</p>
                        <p className="text-[11px] text-muted">{formatRelativeTime(c.updated_at)}</p>
                      </button>
                      <div className="flex items-center gap-0.5 pr-1.5 pl-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                        <Tooltip label="Archive conversation" position="bottom" align="start">
                          <button
                            type="button"
                            onClick={() => handleArchive(c)}
                            aria-label="Archive conversation"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-ink/10 hover:text-ink transition-colors duration-150"
                          >
                            <Archive size={12} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Delete permanently" position="bottom" align="start">
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            aria-label="Delete conversation"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-red-500/15 hover:text-red-600 transition-colors duration-150"
                          >
                            <Trash2 size={12} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-2 py-2 border-t border-primary/10">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="w-full"
                  icon={SquarePen}
                  onClick={newChat}
                >
                  New chat
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* ── Modern High-Contrast Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 bg-surface shrink-0 border-b border-border shadow-xs">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-black shrink-0 shadow-xs">
                <Sparkles size={18} className="text-black" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 border-2 border-surface" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink flex items-center gap-2">
                  AI Financial Advisor
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    LIVE
                  </span>
                </p>
                <p className="text-xs text-muted mt-0.5 truncate">Grounded in your recommendations</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip label="Chat history" position="bottom" align="end">
                  <button
                    type="button"
                    onClick={toggleHistory}
                    aria-label="Show chat history"
                    aria-pressed={historyOpen}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
                      historyOpen ? 'bg-primary/20 text-primary-dark dark:text-primary font-bold' : 'text-muted hover:text-ink hover:bg-bg'
                    }`}
                  >
                    <History size={16} />
                  </button>
                </Tooltip>
                <Tooltip label="Start a new chat" position="bottom" align="end">
                  <button
                    type="button"
                    onClick={newChat}
                    aria-label="Start a new chat"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-bg transition-colors duration-150"
                  >
                    <SquarePen size={16} />
                  </button>
                </Tooltip>
                <Tooltip label="Minimize" position="bottom" align="end">
                  <button
                    type="button"
                    onClick={closePanel}
                    aria-label="Minimize AI advisor chat"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-bg transition-colors duration-150"
                  >
                    <X size={16} />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* ── Message Scroll Area ── */}
            {/* aria-live announces new assistant/user messages to screen readers as they arrive */}
            <div
              ref={scrollRef}
              role="log"
              aria-live="polite"
              aria-label="AI advisor conversation"
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-bg/50"
            >
              {messages.map((m, i) => (
                <ChatMessageBubble key={i} role={m.role} text={m.text} />
              ))}
              {hydrating && (
                <div className="flex items-end gap-2.5" aria-label="Loading conversation">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-amber-700 dark:text-primary border border-primary/30">
                    <History size={12} />
                  </div>
                  <div className="rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3 text-sm text-muted flex items-center gap-2 shadow-sm">
                    <span className="inline-flex gap-1.5 items-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                    </span>
                    Loading conversation...
                  </div>
                </div>
              )}
              {isThinking && (
                <div className="flex items-end gap-2.5" aria-label="AI advisor is typing">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-amber-700 dark:text-primary border border-primary/30">
                    <Sparkles size={13} />
                  </div>
                  <div className="rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3 shadow-sm">
                    <span className="inline-flex gap-1.5 items-center">
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 rounded-full bg-primary-dark animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Suggested Prompts (fresh chat only) ── */}
            {messages.length <= 1 && (
              <div className="px-4 pb-3 pt-2.5 flex flex-wrap gap-1.5 border-t border-border bg-surface/50">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => sendMessage(p)}
                    disabled={isThinking}
                    className="text-xs px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-ink dark:text-primary-light
                      hover:bg-primary/20 hover:border-primary/60
                      transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed font-medium shadow-xs"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* ── Input Bar ── */}
            <form
              onSubmit={handleChatSubmit}
              className="border-t border-border bg-surface px-3 py-3 flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about cash flow, costs, risk..."
                aria-label="Ask the AI advisor a question"
                disabled={isThinking}
                className="flex-1 h-9 px-3.5 rounded-xl border border-border bg-bg text-ink!
                  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                  transition-all duration-150 text-sm"
                style={INPUT_TEXT_STYLE}
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isThinking}
                aria-label="Send message"
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl font-bold text-sm
                  bg-primary text-black
                  hover:bg-primary-dark
                  disabled:opacity-40 disabled:cursor-not-allowed
                  shadow-xs shadow-primary/20
                  transition-all duration-150 active:scale-95 shrink-0"
              >
                <Send size={14} className="text-black" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {!open && (
        <div className="flex items-end gap-3">
          {teaserText && (
            <div className="relative max-w-60 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl animate-fadeIn bg-primary text-black shadow-primary/25 border border-primary-dark/20">
              <button
                type="button"
                onClick={() => setTeaserText(null)}
                aria-label="Dismiss"
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black text-white hover:bg-black transition-colors duration-150 shadow-xs"
              >
                <X size={11} />
              </button>
              {teaserText}
              {/* speech-bubble tail pointing right toward the FAB */}
              <span className="absolute top-1/2 -right-1.5 -translate-y-1/2 h-3 w-3 bg-primary rotate-45 rounded-xs" />
            </div>
          )}

          <button
            type="button"
            onClick={openChat}
            aria-label="Open AI advisor chat"
            aria-expanded={open}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black shadow-xl shadow-primary/35 hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-surface"
          >
            <Sparkles size={24} className="text-black" />
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-surface" />
            </span>
          </button>
        </div>
      )}

      {deleteTarget && (
        <Modal
          open
          onClose={() => !deleting && setDeleteTarget(null)}
          title="Delete conversation"
          maxWidth="max-w-md"
          footer={
            <>
              <Button variant="secondary" size="md" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" size="md" loading={deleting} onClick={confirmDelete}>
                Delete
              </Button>
            </>
          }
        >
          <p className="wrap-break-word text-sm text-ink">
            Delete <span className="wrap-break-word font-semibold">{deleteTarget.title || 'this conversation'}</span>{' '}
            permanently?
          </p>
          <p className="mt-2 wrap-break-word text-xs text-muted">
            This will remove the conversation and all of its messages. This action cannot be undone. If you might need
            it again, choose Archive instead.
          </p>
          {deleteError && (
            <div className="mt-3 rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">{deleteError}</div>
          )}
        </Modal>
      )}
    </div>
  )
}