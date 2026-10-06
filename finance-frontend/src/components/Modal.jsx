import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const SIZE_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
  '3xl': 'max-w-6xl',
}

// Modals nest — the batch-approve dialog opens a per-expense confirmation,
// and several detail views open their own edit dialogs. Scroll locking
// therefore has to be reference counted: the old code set body.overflow to
// '' on unmount, so closing an inner dialog made the page scrollable behind
// an outer one that was still open.
let scrollLockCount = 0

function lockScroll() {
  scrollLockCount += 1
  document.body.style.overflow = 'hidden'
}

function releaseScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) document.body.style.overflow = ''
}

export default function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-md', size, blurBackdrop = false }) {
  const resolvedMaxWidth = size ? (SIZE_MAP[size] || size) : maxWidth
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    lockScroll()
    document.dispatchEvent(new Event('fms:modal-open'))
    return () => releaseScroll()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
      // Let the browser dismiss an open select before dismissing its dialog.
      if (document.querySelector('select:open')) {
        e.stopPropagation()
        return
      }
      // Every open modal listens on the document, so without this one Escape
      // in a nested dialog also closed the dialog behind it. Topmost is the
      // last panel in document order — that is what actually paints on top.
      // (An effect-order stack gets this backwards: React runs child effects
      // before parent effects, so a nested child would register first.)
      const panels = document.querySelectorAll('.app-modal')
      if (panels.length === 0 || panels[panels.length - 1] !== panelRef.current) return
      if (!e.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [open, onClose])

  if (!open) return null

  return (
    // items-end on mobile turns this into a bottom sheet; items-center on sm+ centers a normal dialog
    <div className="fixed inset-0 z-60 flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop  -  blurBackdrop is opt-in per modal instance so this stays unchanged everywhere else */}
      <div
        className={`absolute inset-0 bg-black/60 animate-fadeIn ${blurBackdrop ? 'backdrop-blur-md' : 'backdrop-blur-sm'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel: capped height + flex-col so header/footer stay pinned and only the body scrolls */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`app-modal relative flex min-w-0 w-full ${resolvedMaxWidth} max-h-[92vh] sm:max-h-[85vh] flex-col
          rounded-t-2xl border border-b-0 border-border bg-surface shadow-dropdown animate-fadeIn
          sm:rounded-2xl sm:border-b sm:border-border`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="min-w-0 break-words text-base font-semibold tracking-tight text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="modal-footer flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-bg/60 px-5 py-4 rounded-b-none sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
