import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

/**
 * Custom Scrollable Dropdown Menu with Max Visible Items & Search
 *
 * Why this is needed: Native HTML <select> dropdowns are rendered by the OS / browser
 * and ignore CSS max-height or scroll restrictions. This custom component restricts
 * the popup height so only ~5 items are visible at once with a clean scrollbar.
 */
export default function ScrollableDropdown({
  label = '',
  placeholder = '-- Select --',
  options = [], // [{ value: 'id', label: 'Display text', group?: 'Luzon' }] or string[]
  value = '',
  onChange,
  disabled = false,
  searchable = true,
  maxVisibleItems = 5,
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const containerRef = useRef(null)

  // Normalize options into { value, label, group }
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'string') return { value: opt, label: opt }
    return opt
  })

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [open])

  // Filter options based on user typing
  const filteredOptions = normalizedOptions.filter((opt) =>
    opt.label.toLowerCase().includes(filter.toLowerCase())
  )

  // Current selected option label
  const selectedOption = normalizedOptions.find((opt) => String(opt.value) === String(value))

  // Height of ~5 items (~36px each = ~180px)
  const maxHeightPx = maxVisibleItems * 36

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev)
            setFilter('')
          }
        }}
        className={`w-full h-8.5 px-2.5 rounded-lg border border-border bg-bg text-xs flex items-center justify-between transition-all duration-150 text-left ${
          disabled
            ? 'opacity-60 cursor-not-allowed bg-slate-100/50 dark:bg-slate-800/40 text-muted'
            : open
            ? 'border-primary ring-1 ring-primary/50 text-ink shadow-sm'
            : 'text-ink hover:border-border/80'
        }`}
      >
        <span className="truncate pr-1">
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-muted transition-transform duration-200 ${
            open ? 'rotate-180 text-primary' : ''
          }`}
        />
      </button>

      {/* Floating Dropdown Menu with Max 5 visible items and scrollbar */}
      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-surface shadow-lg overflow-hidden animate-fadeIn"
          style={{ minWidth: '180px' }}
        >
          {/* Quick Search bar if options list is long */}
          {searchable && normalizedOptions.length > 7 && (
            <div className="p-1.5 border-b border-border bg-bg/50">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Quick filter..."
                  className="w-full h-7 pl-6 pr-2 rounded-md border border-border bg-surface text-xs text-ink placeholder:text-muted focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* Scrollable list bounded to ~5 items height */}
          <div
            className="overflow-y-auto divide-y divide-border/20 py-1"
            style={{ maxHeight: `${maxHeightPx}px` }}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted text-center">No match found</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                    className={`w-full px-2.5 py-2 text-xs flex items-center justify-between text-left transition-colors duration-100 ${
                      isSelected
                        ? 'bg-primary/15 text-primary-dark font-medium'
                        : 'text-ink hover:bg-bg'
                    }`}
                  >
                    <span className="truncate pr-2">{opt.label}</span>
                    {isSelected && <Check size={12} className="shrink-0 text-primary" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

