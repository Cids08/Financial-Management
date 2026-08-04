import { ChevronRight, Home } from 'lucide-react'

export default function Breadcrumb({ items = [] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Home size={14} className="text-muted" />
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <span key={idx} className="flex items-center gap-1.5">
            <ChevronRight size={13} className="text-border" />
            <span className={isLast ? 'text-ink font-medium' : 'text-muted hover:text-ink cursor-pointer transition-colors'}>
              {item}
            </span>
          </span>
        )
      })}
    </nav>
  )
}
