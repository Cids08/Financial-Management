import { ChevronRight, Home } from 'lucide-react'

export default function Breadcrumb({ items = [] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs">
      <Home size={14} className="text-muted" />
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <span key={idx} className="flex items-center gap-1.5">
            <ChevronRight size={13} className="text-border" />
            <span aria-current={isLast ? 'page' : undefined} className={isLast ? 'text-ink font-medium' : 'text-muted'}>
              {item}
            </span>
          </span>
        )
      })}
    </nav>
  )
}
