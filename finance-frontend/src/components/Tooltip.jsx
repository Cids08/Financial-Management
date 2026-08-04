import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8 // px between trigger and tooltip

export default function Tooltip({ label, children, position = 'top', align = 'center' }) {
  const triggerRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const updatePosition = () => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()

    let top = 0
    let left = 0

    if (position === 'top' || position === 'bottom') {
      top = position === 'top' ? rect.top - GAP : rect.bottom + GAP
      left = align === 'start' ? rect.left : align === 'end' ? rect.right : rect.left + rect.width / 2
    } else {
      left = position === 'left' ? rect.left - GAP : rect.right + GAP
      top = rect.top + rect.height / 2
    }

    setCoords({ top, left })
  }

  const show = () => { updatePosition(); setVisible(true) }
  const hide = () => setVisible(false)

  // Reposition on scroll/resize while open — the tooltip is fixed-positioned
  // via portal now, so it won't move with the trigger automatically.
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

  const translateClasses = {
    top: {
      center: '-translate-x-1/2 -translate-y-full',
      start: '-translate-y-full',
      end: '-translate-x-full -translate-y-full',
    },
    bottom: {
      center: '-translate-x-1/2',
      start: '',
      end: '-translate-x-full',
    },
    left: { center: '-translate-x-full -translate-y-1/2' },
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