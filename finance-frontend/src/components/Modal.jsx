import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-md', blurBackdrop = false }) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    // items-end on mobile turns this into a bottom sheet; items-center on sm+ centers a normal dialog
    <div className="fixed inset-0 z-60 flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop — blurBackdrop is opt-in per modal instance so this stays unchanged everywhere else */}
      <div
        className={`absolute inset-0 bg-ink/50 animate-fadeIn ${blurBackdrop ? 'backdrop-blur-md' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel: capped height + flex-col so header/footer stay pinned and only the body scrolls */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex w-full ${maxWidth} max-h-[92vh] sm:max-h-[85vh] flex-col
          rounded-t-2xl border border-border bg-surface shadow-dropdown animate-fadeIn
          sm:rounded-xl`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}