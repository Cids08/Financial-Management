import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

/**
 * Right-side drawer — same visual language as Modal.jsx (bg-surface,
 * border-border, shadow) but for content that benefits from more width
 * and staying anchored to what triggered it (e.g. a chart for a specific
 * table row), rather than a centered overlay that hides the whole page.
 *
 * Animates in via a mount-then-transition pattern (no custom Tailwind
 * keyframes needed) — reuses the ease-in-out-smooth timing function
 * already defined for Sidebar.jsx's collapse transition.
 */
export default function SlideOver({ open, onClose, title, subtitle, footer, children, widthClass = 'max-w-md' }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!open) {
      setMounted(false)
      return
    }
    const raf = requestAnimationFrame(() => setMounted(true))
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex h-full w-full ${widthClass} flex-col bg-surface shadow-2xl
          transition-transform duration-300 ease-in-out-smooth
          ${mounted ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink truncate">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}