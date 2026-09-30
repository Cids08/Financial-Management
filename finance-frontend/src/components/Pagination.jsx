import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
  label = 'items',
  showRange = false,
  rangeStart,
  rangeEnd,
  bordered = false,
  className = '',
}) {
  const left =
    showRange && rangeStart != null && rangeEnd != null
      ? `Showing ${rangeStart} - ${rangeEnd} of ${total} ${label}`
      : total != null
        ? `Page ${page} of ${totalPages} · ${total} ${label} total`
        : `Page ${page} of ${totalPages}`

  return (
    <div
      className={`flex flex-col gap-3 px-4 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between ${
        bordered ? 'border-t border-border' : ''
      } ${className}`}
    >
      <p>{left}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          icon={ChevronLeft}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="min-w-8 text-center font-semibold tabular-nums text-ink" aria-label={`Page ${page} of ${totalPages}`}>{page} / {totalPages}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          icon={ChevronRight}
          iconPosition="right"
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
