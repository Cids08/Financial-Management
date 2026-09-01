import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, X } from 'lucide-react'
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

// Recurring "still here" nudge while minimized: a different short line pops
// up every TEASER_INTERVAL_MS, stays for TEASER_VISIBLE_MS, then hides until
// the next tick. Keeps going only while the panel is minimized — stops the
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
  const [teaserText, setTeaserText] = useState(null)
  const [messages, setMessages] = useState(() => [buildGreeting(firstName)])
  const [chatInput, setChatInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const scrollRef = useRef(null)
  const lastTeaserIndexRef = useRef(-1)
  const hasShownFirstTeaserRef = useRef(false)

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
  // the greeting in place, but ONLY while it's still the sole message —
  // never touch it after the user has started actually chatting.
  useEffect(() => {
    if (firstName) {
      setMessages((prev) => (prev.length === 1 && prev[0].role === 'assistant' ? [buildGreeting(firstName)] : prev))
    }
  }, [firstName])

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
    setTeaserText(null)
    setOpen(true)
  }

  return (
    <div className="fixed bottom-5 right-5 z-60 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(26rem,calc(100vw-2.5rem))] h-[min(38rem,calc(100vh-6rem))] rounded-xl border-2 border-primary/40 bg-surface shadow-lg shadow-primary/10 flex flex-col overflow-hidden animate-fadeIn">
          <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-ink shrink-0">
              <Sparkles size={17} />
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
              aria-label="Minimize AI advisor chat"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/10 text-ink hover:bg-ink/20 transition-colors duration-150"
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
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          >
            {messages.map((m, i) => (
              <ChatMessageBubble key={i} role={m.role} text={m.text} />
            ))}
            {isThinking && (
              <div className="flex items-start gap-2" aria-label="AI advisor is typing">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg text-muted border border-border">
                  <Sparkles size={13} />
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
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sendMessage(p)}
                  disabled={isThinking}
                  className="text-xs px-2.5 py-1 rounded-full border border-primary/50 bg-primary/10 text-ink hover:bg-primary/20 hover:border-primary/70 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleChatSubmit} className="border-t border-primary/20 bg-primary/5 p-3 flex items-center gap-2">
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
      )}

      {!open && (
        <div className="flex items-end gap-2">
          {teaserText && (
            <div className="relative max-w-56 rounded-2xl bg-primary text-ink px-3.5 py-2.5 text-sm font-medium shadow-xl shadow-primary/30 animate-fadeIn">
              <button
                type="button"
                onClick={() => setTeaserText(null)}
                aria-label="Dismiss"
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-primary border-2 border-surface hover:opacity-80"
              >
                <X size={11} />
              </button>
              {teaserText}
              {/* speech-bubble tail pointing right toward the circle button,
                  which sits beside (not below) the bubble in this flex row */}
              <span className="absolute top-1/2 -right-1.5 -translate-y-1/2 h-3 w-3 bg-primary rotate-45 rounded-xs" />
            </div>
          )}

          <button
            type="button"
            onClick={openChat}
            aria-label="Open AI advisor chat"
            aria-expanded={open}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-ink shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-transform duration-150"
          >
            <Sparkles size={24} />
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-surface" />
            </span>
          </button>
        </div>
      )}
    </div>
  )
}