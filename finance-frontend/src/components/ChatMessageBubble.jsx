import { memo } from 'react'
import { Bot, User } from 'lucide-react'

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
        <strong key={idx} className="font-bold text-ink">
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
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-primary/15 text-primary-dark' : 'bg-bg text-muted border border-border'
        }`}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-line leading-relaxed ${
          isUser ? 'bg-primary text-white rounded-tr-sm' : 'bg-bg text-ink border border-border rounded-tl-sm'
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