import { useState, useRef } from 'react'
import { Bell, ReceiptText, CircleAlert, CheckCircle2 } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'

const notifications = [
  {
    id: 1,
    icon: ReceiptText,
    iconBg: 'bg-primary/15 text-primary-dark',
    title: 'Invoice #INV-2091 is overdue',
    time: '10 minutes ago',
  },
  {
    id: 2,
    icon: CheckCircle2,
    iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    title: 'Payment received from Alibaton Corp.',
    time: '1 hour ago',
  },
  {
    id: 3,
    icon: CircleAlert,
    iconBg: 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400',
    title: 'Budget for Q3 Marketing exceeded',
    time: '3 hours ago',
  },
]

export default function Notification() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false))

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-lg
          text-muted hover:text-ink hover:bg-bg transition-colors duration-150"
      >
        <Bell size={19} />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-surface" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 bg-surface rounded-xl border border-border
            shadow-dropdown animate-fadeIn origin-top-right z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <span className="text-xs font-medium text-primary-dark bg-primary/15 px-2 py-0.5 rounded-full">
              {notifications.length} new
            </span>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <li
                key={n.id}
                className="flex gap-3 px-4 py-3 hover:bg-bg cursor-pointer transition-colors duration-150 border-b border-border last:border-0"
              >
                <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${n.iconBg}`}>
                  <n.icon size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-ink leading-snug truncate">{n.title}</p>
                  <p className="text-xs text-muted mt-0.5">{n.time}</p>
                </div>
              </li>
            ))}
          </ul>
          <button className="w-full text-center text-sm font-medium text-ink py-2.5 hover:bg-bg transition-colors duration-150 rounded-b-xl">
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}