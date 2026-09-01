import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SearchX, Clock } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import { usePermissions } from '../context/PermissionsContext'
import { menuData } from '../utils/menuData'

/* ---------------------------------------------------------------------- */
/* Search index — built from menuData itself, so every suggestion points  */
/* at a real, existing route. No page is invented here; if a route isn't  */
/* in menuData, it simply can't appear as a suggestion.                   */
/* ---------------------------------------------------------------------- */

// Extra searchable terms per menu item id, beyond its literal label — this
// is what makes typing "cash" surface "Reports" (cash flow report), even
// though the word "cash" isn't in the word "Reports" itself. Purely for
// matching; never shown as the displayed label.
const EXTRA_KEYWORDS = {
  'cash-accounts': ['cash flow', 'cash transactions', 'bank balance', 'wallet'],
  reports: ['cash flow report', 'financial report', 'statement'],
  forecasting: ['cash flow forecast', 'projection', 'prediction'],
  ai: ['ai recommendation', 'manage expected cash flow', 'insight', 'suggestion'],
  ar: ['invoice', 'invoices', 'billing', 'customer invoice', 'customer transaction', 'receivable'],
  ap: ['bill', 'bills', 'vendor payment', 'payable'],
  collections: ['customer payment', 'receipt', 'collect'],
  expenses: ['spending', 'cost', 'expense'],
  customers: ['client', 'customer'],
  suppliers: ['vendor', 'supplier'],
  tax: ['bir', 'vat', 'withholding tax', 'percentage tax'],
  'general-ledger': ['journal', 'ledger entries', 'gl'],
  budgets: ['budgeting', 'allocation'],
  disbursements: ['payment', 'payout', 'disburse'],
  'fixed-assets': ['asset', 'equipment', 'property'],
  departments: ['department', 'branch'],
  collectors: ['collector', 'field agent'],
  users: ['user', 'account', 'staff'],
  roles: ['role', 'permission', 'access'],
}

// Flattens menuData's nested {children} structure into a single searchable
// list. `isLogout` items are excluded on purpose — navigating to it via
// search would trigger the logout flow rather than showing a page, which
// isn't what a "search suggestion" should ever silently do.
function buildSearchIndex(items, groupLabel = null) {
  return items.reduce((acc, item) => {
    if (item.isLogout) return acc
    if (Array.isArray(item.children)) {
      acc.push(...buildSearchIndex(item.children, item.label))
      return acc
    }
    acc.push({
      id: item.id,
      label: item.label,
      icon: item.icon,
      path: item.path,
      permission: item.permission,
      group: groupLabel,
      keywords: EXTRA_KEYWORDS[item.id] || [],
    })
    return acc
  }, [])
}

const SEARCH_INDEX = buildSearchIndex(menuData)

// Curated default suggestions shown before the user types anything —
// mirrors the "Search by category" list from the design spec, using only
// ids that exist for real in menuData. Kept short and compact on purpose.
const DEFAULT_SUGGESTION_IDS = ['customers', 'suppliers', 'expenses', 'ar', 'reports', 'ai', 'forecasting']

const RECENT_STORAGE_KEY = 'fms_recent_searches'
const MAX_RECENT = 5

function loadRecentIds() {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function matchesQuery(item, needle) {
  if (item.label.toLowerCase().includes(needle)) return true
  return item.keywords.some((k) => k.toLowerCase().includes(needle))
}

export default function SearchBar({ className = '' }) {
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [recentIds, setRecentIds] = useState(loadRecentIds)

  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useClickOutside(containerRef, () => {
    setIsOpen(false)
    setQuery('')
  })

  // Only items the logged-in user actually has permission for ever reach
  // the dropdown — same rule Sidebar.jsx applies to menuData.
  const permittedIndex = useMemo(
    () => SEARCH_INDEX.filter((item) => hasPermission(item.permission)),
    [hasPermission]
  )

  const defaultSuggestions = useMemo(
    () => DEFAULT_SUGGESTION_IDS
      .map((id) => permittedIndex.find((item) => item.id === id))
      .filter(Boolean),
    [permittedIndex]
  )

  const recentItems = useMemo(
    () => recentIds
      .map((id) => permittedIndex.find((item) => item.id === id))
      .filter(Boolean)
      .slice(0, MAX_RECENT),
    [recentIds, permittedIndex]
  )

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return permittedIndex.filter((item) => matchesQuery(item, needle)).slice(0, 8)
  }, [query, permittedIndex])

  const isSearching = query.trim().length > 0

  // Single flat list driving keyboard navigation — its order must match
  // exactly what's rendered below, so activeIndex always points at the
  // row the person is actually looking at.
  const visibleItems = useMemo(() => {
    if (isSearching) return searchResults
    return [...defaultSuggestions, ...recentItems]
  }, [isSearching, searchResults, defaultSuggestions, recentItems])

  // Keep the highlighted row valid whenever the visible list changes shape
  // (typing, opening, results changing) instead of pointing at a stale index.
  useEffect(() => {
    setActiveIndex(visibleItems.length > 0 ? 0 : -1)
  }, [visibleItems])

  const addRecent = useCallback((id) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT)
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // localStorage unavailable (private mode, quota, etc.) — recent
        // searches just won't persist across reloads, nothing else breaks.
      }
      return next
    })
  }, [])

  const clearRecent = useCallback((e) => {
    e.stopPropagation()
    setRecentIds([])
    try {
      localStorage.removeItem(RECENT_STORAGE_KEY)
    } catch {
      // see note above
    }
  }, [])

  const selectItem = useCallback((item) => {
    if (!item?.path) return
    navigate(item.path)
    addRecent(item.id)
    setQuery('')
    setIsOpen(false)
    inputRef.current?.blur()
  }, [navigate, addRecent])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (visibleItems.length === 0) return
      setActiveIndex((i) => Math.min(i + 1, visibleItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (visibleItems.length === 0) return
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && visibleItems[activeIndex]) {
        selectItem(visibleItems[activeIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setQuery('')
      inputRef.current?.blur()
    }
  }

  // Ctrl+K / Cmd+K focuses the search bar from anywhere on the page.
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  const renderRow = (item, index) => {
    const Icon = item.icon
    const highlighted = index === activeIndex
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => selectItem(item)}
        onMouseEnter={() => setActiveIndex(index)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left rounded-lg transition-colors duration-150
          ${highlighted ? 'bg-primary/10 text-primary-dark' : 'text-ink hover:bg-bg'}`}
      >
        <Icon size={15} className={highlighted ? 'text-primary-dark shrink-0' : 'text-muted shrink-0'} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.group && (
          <span className="text-[11px] text-muted shrink-0">{item.group}</span>
        )}
      </button>
    )
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
      />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search transactions, customers, invoices..."
        autoComplete="off"
        className="w-full h-9 pl-9 pr-14 rounded-lg border border-border bg-bg text-sm
          text-ink placeholder:text-muted
          focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
          transition-all duration-150"
      />
      {!isOpen && !query && (
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none
          text-[10px] font-medium text-muted border border-border rounded px-1.5 py-0.5 bg-surface">
          Ctrl K
        </kbd>
      )}

      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-surface rounded-xl border border-border
            shadow-dropdown animate-fadeIn origin-top max-h-96 overflow-y-auto py-1.5"
        >
          {isSearching ? (
            <>
              <p className="px-3.5 pt-1.5 pb-1 text-[11px] font-medium text-muted uppercase tracking-wide truncate">
                Search results for "{query}"
              </p>
              {searchResults.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <SearchX size={22} className="text-muted" />
                  <p className="text-sm font-medium text-ink">No results found</p>
                  <p className="text-xs text-muted">
                    Try searching for transactions, customers, invoices, or reports.
                  </p>
                </div>
              ) : (
                <div className="px-1.5 space-y-0.5">
                  {searchResults.map((item, i) => renderRow(item, i))}
                </div>
              )}
            </>
          ) : (
            <>
              {defaultSuggestions.length > 0 && (
                <>
                  <p className="px-3.5 pt-1.5 pb-1 text-[11px] font-medium text-muted uppercase tracking-wide">
                    Search by category
                  </p>
                  <div className="px-1.5 space-y-0.5">
                    {defaultSuggestions.map((item, i) => renderRow(item, i))}
                  </div>
                </>
              )}

              {recentItems.length > 0 && (
                <>
                  <div className="my-1.5 border-t border-border" />
                  <div className="flex items-center justify-between px-3.5 pt-1 pb-1">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted uppercase tracking-wide">
                      <Clock size={11} /> Recent Searches
                    </p>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-[11px] text-muted hover:text-ink underline transition-colors duration-150"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="px-1.5 space-y-0.5">
                    {recentItems.map((item, i) => renderRow(item, defaultSuggestions.length + i))}
                  </div>
                </>
              )}

              {defaultSuggestions.length === 0 && recentItems.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <SearchX size={22} className="text-muted" />
                  <p className="text-sm font-medium text-ink">Nothing to show yet</p>
                  <p className="text-xs text-muted">Start typing to search the system.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}