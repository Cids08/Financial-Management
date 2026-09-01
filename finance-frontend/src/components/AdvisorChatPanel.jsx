import { useEffect, useRef, useState } from 'react'
import { Bot, Send, X } from 'lucide-react'
import Button from './Button'
import ChatMessageBubble from './ChatMessageBubble'
import { useAiAdvisor } from '../hooks/useAiAdvisor'
import { useProfile } from '../hooks/useProfile'

const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)' }

const SUGGESTED_PROMPTS = [
  'Which forecast has the lowest confidence?',
  'How can we reduce expenses?',
  'Summarize the risk alerts',
  'What should we do about collections?',
]

// How long the teaser speech bubble stays up before auto-dismissing, and how
// long to wait after mount before showing it (gives the page a beat to settle
// instead of popping up the instant the route loads).
const TEASER_SHOW_DELAY_MS = 1200
const TEASER_AUTO_HIDE_MS = 6000

// Width of the docked panel. Kept as one constant so the panel width and
// its slide-in transform stay in sync.
const PANEL_WIDTH = 'w-[min(24rem,100vw)]'

// Same fallback the header uses when profile.name isn't available yet
// (see Header.jsx: `profile?.name || 'User'`), so the greeting never
// shows "Hi undefined" during the brief window before useProfile resolves.
function buildGreeting(firstName) {
  const name = firstName ? `Hi ${firstName}` : 'Hi'
  return {
    role: 'assistant',
    text: `${name}, I'm your AI financial advisor. Ask me about any of the recommendations on this page — cash flow, expenses, revenue, or budget.`,
    at: new Date().toISOString(),
  }
}

export default function AdvisorChatPanel() {
  const { sendMessage: sendToAdvisor } = useAiAdvisor()
  // Same hook Header.jsx uses for "Good afternoon, Carl" — one source of
  // truth for the user's name, no separate fetch here.
  const { profile } = useProfile()
  const firstName = profile?.name?.split(' ')[0]

  const [open, setOpen] = useState(false)
  const [showTeaser, setShowTeaser] = useState(false)
  const [messages, setMessages] = useState(() => [buildGreeting(firstName)])
  const [chatInput, setChatInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const scrollRef = useRef(null)

  // Profile loads asynchronously, so the very first render (before
  // useProfile resolves) won't have a name yet. Once it arrives, update
  // the greeting in place, but ONLY while it's still the sole message —
  // never touch it after the user has started actually chatting.
  useEffect(() => {
    if (firstName) {
      setMessages((prev) => (prev.length === 1 && prev[0].role === 'assistant' ? [buildGreeting(firstName)] : prev))
    }
  }, [firstName])

  // Minimized-state teaser: pop up a small speech bubble near the circle
  // once, shortly after mount, so the advisor announces itself without
  // forcing the panel open. Dismissed by opening the chat, closing it
  // manually, or after a timeout — whichever comes first.
  useEffect(() => {
    if (open) return
    const showTimer = setTimeout(() => setShowTeaser(true), TEASER_SHOW_DELAY_MS)
    return () => clearTimeout(showTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!showTeaser) return
    const hideTimer = setTimeout(() => setShowTeaser(false), TEASER_AUTO_HIDE_MS)
    return () => clearTimeout(hideTimer)
  }, [showTeaser])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isThinking, open])

  // Docked panel reads as a focused mode, so close it on Escape like any
  // other dismissible overlay (Modal.jsx already does this — matching
  // behavior for consistency).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    // Guard against firing a second request while one is still pending —
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
    setShowTeaser(false)
    setOpen(true)
  }

  return (
    <>
      {/* Compact corner widget, anchored at the same bottom-right spot as
          the launcher button below — pops up like a standard chat widget
          (Intercom/Zendesk pattern) instead of docking the full viewport
          height. Capped height means it never reaches high enough to
          overlap the stat cards or top navbar. Always mounted (not
          `open && (...)`) so the transform/opacity transition can animate
          both directions instead of just popping in. */}
      <div
        className={`fixed bottom-20 right-5 z-60 ${PANEL_WIDTH} h-[min(30rem,calc(100vh-7rem))] flex flex-col rounded-xl border border-border shadow-2xl shadow-black/30 overflow-hidden origin-bottom-right
          transition-[transform,opacity] duration-200 ease-out
          ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'}`}
        role="dialog"
        aria-label="AI advisor chat"
      >
        {/* Guaranteed-opaque base. bg-surface (used just above this layer)
            carries an alpha channel by design elsewhere in the app — fine
            for cards sitting on a similarly-toned dashboard background,
            but wrong for a panel that floats over everything else,
            including the footer. bg-white/dark:bg-black have no alpha, so
            nothing behind the panel can ever show through. */}
        <div className="absolute inset-0 -z-20 bg-white dark:bg-black" />
        <div className="absolute inset-0 -z-10 bg-surface bg-linear-to-b from-primary/10 via-transparent to-transparent" />

        <div className="relative flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-3 shrink-0 rounded-t-xl">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-ink shrink-0">
            <Bot size={17} />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 border-2 border-surface" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink flex items-center gap-1.5">
              Ask the AI Advisor
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary text-ink">Live</span>
            </p>
            <p className="text-xs text-muted">Grounded in the recommendations shown here</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close AI advisor chat"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </div>

        {/* aria-live announces new assistant/user messages to screen readers as they arrive */}
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label="AI advisor conversation"
          className="relative flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          {messages.map((m, i) => (
            <ChatMessageBubble key={i} role={m.role} text={m.text} />
          ))}
          {isThinking && (
            <div className="flex items-start gap-2" aria-label="AI advisor is typing">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg text-muted border border-border">
                <Bot size={13} />
              </div>
              <div className="rounded-xl rounded-tl-sm border border-border bg-bg px-3 py-2 text-sm text-muted">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" />
                </span>
              </div>
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="relative px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => sendMessage(p)}
                disabled={isThinking}
                className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-ink hover:bg-primary/15 hover:border-primary/50 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleChatSubmit} className="relative border-t border-primary/20 bg-primary/5 p-3 flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask about cash flow, costs, risk..."
            aria-label="Ask the AI advisor a question"
            disabled={isThinking}
            className={INPUT}
            style={INPUT_TEXT_STYLE}
            autoComplete="off"
          />
          <Button type="submit" variant="primary" size="sm" icon={Send} disabled={!chatInput.trim() || isThinking}>
            Send
          </Button>
        </form>
      </div>

      {/* Launcher: only shown while docked panel is closed, unchanged position/behavior. */}
      {!open && (
        <div className="fixed bottom-20 right-5 z-60 flex items-end gap-2">
          {showTeaser && (
            <div className="relative max-w-52 rounded-xl rounded-br-sm border border-primary/30 bg-surface px-3 py-2 text-xs text-ink shadow-lg animate-fadeIn">
              <button
                type="button"
                onClick={() => setShowTeaser(false)}
                aria-label="Dismiss"
                className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-bg border border-border text-muted hover:text-ink"
              >
                <X size={10} />
              </button>
              {firstName ? `Hi ${firstName}! ` : 'Hi! '}
              Need a hand with cash flow or forecasts?
            </div>
          )}

          <button
            type="button"
            onClick={openChat}
            aria-label="Open AI advisor chat"
            aria-expanded={open}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-ink shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-transform duration-150"
          >
            <Bot size={24} />
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-surface" />
            </span>
          </button>
        </div>
      )}
    </>
  )
}