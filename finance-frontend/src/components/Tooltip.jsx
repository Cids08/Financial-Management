import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8        // px between trigger and tooltip bubble
const MARGIN = 6     // min px to keep from viewport edges

export default function Tooltip({ label, children, position = 'top', align = 'center' }) {
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const updatePosition = () => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()

    let top = 0
    let left = 0

    // ── Raw anchor point ────────────────────────────────────────────────────
    if (position === 'top') {
      top  = rect.top - GAP
    } else if (position === 'bottom') {
      top  = rect.bottom + GAP
    } else if (position === 'left') {
      left = rect.left - GAP
      top  = rect.top + rect.height / 2
    } else {
      left = rect.right + GAP
      top  = rect.top + rect.height / 2
    }

    if (position === 'top' || position === 'bottom') {
      if (align === 'start')       left = rect.left
      else if (align === 'end')    left = rect.right
      else /* center */            left = rect.left + rect.width / 2
    }

    // ── Viewport clamping ───────────────────────────────────────────────────
    // We need the rendered tooltip size to clamp correctly. On the first
    // render the ref isn't attached yet, so fall back to 0 (no clamping)
    // — the next paint with the ref attached will fix it instantly.
    const tip = tooltipRef.current
    if (tip) {
      const tw = tip.offsetWidth
      const th = tip.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Adjust horizontal anchor based on CSS transform so we're clamping
      // the rendered left edge, not just the anchor point.
      let renderedLeft = left
      if (align === 'center' && (position === 'top' || position === 'bottom'))
        renderedLeft = left - tw / 2
      else if (align === 'end' && (position === 'top' || position === 'bottom'))
        renderedLeft = left - tw

      // Clamp so tooltip never exits left or right viewport edge
      const clampedLeft = Math.max(
        MARGIN,
        Math.min(renderedLeft, vw - tw - MARGIN)
      )
      // Translate back to anchor-space so CSS transform still works
      const delta = clampedLeft - renderedLeft
      left += delta

      // Clamp vertical similarly
      let renderedTop = top
      if (position === 'top') renderedTop = top - th
      const clampedTop = Math.max(MARGIN, Math.min(renderedTop, vh - th - MARGIN))
      top += clampedTop - renderedTop
    }

    setCoords({ top, left })
  }

  const show = () => { updatePosition(); setVisible(true) }
  const hide = () => setVisible(false)

  // Reposition on scroll / resize while open — fixed-positioned portal
  // won't move with its trigger automatically.
  useEffect(() => {
    if (!visible) return
    const handle = () => updatePosition()
    window.addEventListener('scroll', handle, true)
    window.addEventListener('resize', handle)
    return () => {
      window.removeEventListener('scroll', handle, true)
      window.removeEventListener('resize', handle)
    }
  }, [visible])

  // Re-run position once the tooltip element mounts so the clamping above
  // has an actual offsetWidth to work with.
  useEffect(() => {
    if (visible) updatePosition()
  }, [visible])

  const translateClasses = {
    top: {
      center: '-translate-x-1/2 -translate-y-full',
      start:  '-translate-y-full',
      end:    '-translate-x-full -translate-y-full',
    },
    bottom: {
      center: '-translate-x-1/2',
      start:  '',
      end:    '-translate-x-full',
    },
    left:  { center: '-translate-x-full -translate-y-1/2' },
    right: { center: '-translate-y-1/2' },
  }[position]?.[align] ?? ''

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible &&
        createPortal(
          <span
            ref={tooltipRef}
            role="tooltip"
            style={{ position: 'fixed', top: coords.top, left: coords.left }}
            className={`pointer-events-none ${translateClasses}
              whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-bg
              z-999 shadow-lg transition-opacity duration-150`}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  )
}