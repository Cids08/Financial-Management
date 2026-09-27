import { memo } from 'react'
import { Sparkles, User } from 'lucide-react'

// The advisor's system prompt is allowed exactly one lightweight
// markdown-like pattern, **text**, reserved for a single genuinely critical
// phrase per reply (a hard number, a risk warning, a deadline). This is the
// only place that syntax is interpreted; everywhere else it would just show
// literal asterisks.
function renderMessageText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-amber-700 dark:text-primary-light">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={idx}>{part}</span>
  })
}

function ChatMessageBubble({ role, text }) {
  const isUser = role === 'user'
  return (
    <div className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-xs ${
          isUser
            ? 'bg-primary text-[#111827]'
            : 'bg-primary/15 text-amber-700 dark:text-primary border border-primary/30'
        }`}
      >
        {isUser ? <User size={13} /> : <Sparkles size={13} />}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line leading-relaxed shadow-sm ${
          isUser
            ? 'bg-primary text-[#111827] font-medium rounded-br-xs'
            : 'bg-surface text-ink border border-border rounded-bl-xs'
        }`}
      >
        {isUser ? text : renderMessageText(text)}
      </div>
    </div>
  )
}

// Memoized: in a long conversation, this stops every earlier bubble from
// re-rendering every time a new message is appended to the list.
export default memo(ChatMessageBubble)