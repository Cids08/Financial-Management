import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SearchX, Clock, ChevronRight, Loader2, LayoutGrid } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import { usePermissions } from '../context/PermissionsContext'
import { apiFetch } from '../utils/api'
import { menuData } from '../utils/menuData'

/* ---------------------------------------------------------------------- */
/* Two search sources feed this dropdown:                                 */
/*  1. PAGE_INDEX — static, client-side, instant. Built from menuData, so */
/*     typing "settings" or "reports" jumps straight to that page.        */
/*  2. Live database records — debounced, from GET /api/search?q=...      */
/*     (SearchController.php). Both render together, Pages first.        */
/* ---------------------------------------------------------------------- */

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2
const RECENT_STORAGE_KEY = 'fms_recent_searches_v2'
const MAX_RECENT = 5
const MAX_PAGE_MATCHES = 5

// Extra searchable terms per menu item id, beyond its literal label —
// lets typing "cash" surface "Reports" (cash flow report) etc.
const EXTRA_KEYWORDS = {
  'cash-accounts': ['cash flow', 'cash transactions', 'bank balance', 'wallet'],
  reports: ['cash flow report', 'financial report', 'statement'],
  forecasting: ['cash flow forecast', 'projection', 'prediction'],
  ai: ['ai recommendation', 'manage expected cash flow', 'insight', 'suggestion'],
  ar: ['invoice', 'invoices', 'billing', 'customer invoice', 'receivable'],
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

// Flattens menuData's nested {children} into one searchable list, and also
// serves as the icon lookup for BOTH page matches and live-record category
// headers below — so every icon in this dropdown is pulled straight from
// menuData/sidebar, never redeclared.
function buildPageIndex(items, map = { list: [], icons: {} }) {
  items.forEach((item) => {
    if (item.isLogout) return
    if (Array.isArray(item.children)) {
      buildPageIndex(item.children, map)
      return
    }
    if (item.icon) map.icons[item.id] = item.icon
    map.list.push({
      id: item.id,
      label: item.label,
      icon: item.icon,
      path: item.path,
      permission: item.permission,
      keywords: EXTRA_KEYWORDS[item.id] || [],
    })
  })
  return map
}
const { list: PAGE_INDEX, icons: ICON_MAP } = buildPageIndex(menuData)

function matchesQuery(item, needle) {
  if (item.label.toLowerCase().includes(needle)) return true
  return item.keywords.some((k) => k.toLowerCase().includes(needle))
}

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function SearchBar({ className = '' }) {
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [results, setResults] = useState([]) // live-record category groups from the API
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [recent, setRecent] = useState(loadRecent)

  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const requestIdRef = useRef(0)

  useClickOutside(containerRef, () => {
    setIsOpen(false)
    setQuery('')
  })

  const isSearching = query.trim().length >= MIN_QUERY_LENGTH

  const permittedPageIndex = useMemo(
    () => PAGE_INDEX.filter((item) => hasPermission(item.permission)),
    [hasPermission]
  )

  // Instant, synchronous — no debounce needed for a static in-memory list.
  const pageMatches = useMemo(() => {
    if (!isSearching) return []
    const needle = query.trim().toLowerCase()
    return permittedPageIndex.filter((item) => matchesQuery(item, needle)).slice(0, MAX_PAGE_MATCHES)
  }, [isSearching, query, permittedPageIndex])

  const performSearch = useCallback(async (term) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await apiFetch(`/api/search?q=${encodeURIComponent(term)}`)
      const json = await res.json()
      if (requestId !== requestIdRef.current) return
      if (!res.ok || !json.success) throw new Error(json.message || 'Search failed.')
      setResults(json.data || [])
    } catch {
      if (requestId === requestIdRef.current) {
        setErrorMsg('Unable to search right now. Please try again.')
        setResults([])
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const term = query.trim()
    if (term.length < MIN_QUERY_LENGTH) {
      setResults([])
      setErrorMsg('')
      setLoading(false)
      return
    }
    const timer = setTimeout(() => performSearch(term), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, performSearch])

  // Flat, render-order-matching list for keyboard navigation: Pages first,
  // then each live-record category (with its "view all" row, if any).
  const navItems = useMemo(() => {
    if (!isSearching) {
      return recent.map((r) => ({ kind: 'recent', ...r }))
    }
    const flat = pageMatches.map((p) => ({ kind: 'page', type: p.id, path: p.path, title: p.label }))
    results.forEach((group) => {
      group.items.forEach((item) => {
        flat.push({ kind: 'result', type: group.type, route: group.route, label: group.label, ...item })
      })
      if (group.has_more) {
        flat.push({ kind: 'viewAll', type: group.type, route: group.route, label: group.label })
      }
    })
    return flat
  }, [isSearching, recent, pageMatches, results])

  useEffect(() => {
    setActiveIndex(navItems.length > 0 ? 0 : -1)
  }, [navItems])

  const addRecent = useCallback((entry) => {
    setRecent((prev) => {
      const withoutDupe = prev.filter((e) => !(e.type === entry.type && e.id === entry.id))
      const next = [{ ...entry, ts: Date.now() }, ...withoutDupe].slice(0, MAX_RECENT)
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // localStorage unavailable — recent searches just won't persist.
      }
      return next
    })
  }, [])

  const clearRecent = useCallback((e) => {
    e.stopPropagation()
    setRecent([])
    try {
      localStorage.removeItem(RECENT_STORAGE_KEY)
    } catch {
      // see note above
    }
  }, [])

  const closeAndReset = () => {
    setIsOpen(false)
    setQuery('')
  }

  const selectNavItem = (entry) => {
    if (entry.kind === 'page') {
      // A page/module link, not a specific record — nothing to highlight,
      // and it doesn't belong in "recent records" search history either.
      navigate(entry.path)
      closeAndReset()
      inputRef.current?.blur()
      return
    }
    if (entry.kind === 'viewAll') {
      navigate(entry.route)
      closeAndReset()
      inputRef.current?.blur()
      return
    }
    // A specific database record: navigate to its module's list page and
    // pass its id (plus a search_hint, when the backend provided one —
    // see SearchController::searchableEntities()) via router state. The
    // destination page reads this with useHighlightRow() (see
    // hooks/useHighlightRow.js) to seed its own search box if needed,
    // then scroll to and highlight that exact row once it renders.
    navigate(entry.route, { state: { highlightId: entry.id, highlightSearch: entry.search_hint ?? null } })
    addRecent({
      type: entry.type,
      id: entry.id,
      route: entry.route,
      label: entry.label,
      title: entry.title,
      subtitle: entry.subtitle,
      search_hint: entry.search_hint ?? null,
    })
    closeAndReset()
    inputRef.current?.blur()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (navItems.length === 0) return
      setActiveIndex((i) => Math.min(i + 1, navItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (navItems.length === 0) return
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && navItems[activeIndex]) {
        selectNavItem(navItems[activeIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeAndReset()
      inputRef.current?.blur()
    }
  }

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

  const renderPageRow = (entry, index) => {
    const Icon = ICON_MAP[entry.type] || Search
    const highlighted = index === activeIndex
    return (
      <button
        key={`page-${entry.type}`}
        type="button"
        onClick={() => selectNavItem(entry)}
        onMouseEnter={() => setActiveIndex(index)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-left transition-colors duration-150
          ${highlighted ? 'bg-primary/10' : 'hover:bg-bg'}`}
      >
        <Icon size={15} className={`shrink-0 ${highlighted ? 'text-primary-dark' : 'text-muted'}`} />
        <span className={`flex-1 truncate text-sm ${highlighted ? 'text-primary-dark' : 'text-ink'}`}>{entry.title}</span>
      </button>
    )
  }

  const renderItemRow = (entry, index) => {
    const Icon = ICON_MAP[entry.type] || Search
    const highlighted = index === activeIndex
    return (
      <button
        key={`${entry.type}-${entry.id}-${entry.kind}`}
        type="button"
        onClick={() => selectNavItem(entry)}
        onMouseEnter={() => setActiveIndex(index)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-left transition-colors duration-150
          ${highlighted ? 'bg-primary/10' : 'hover:bg-bg'}`}
      >
        <Icon size={15} className={`shrink-0 ${highlighted ? 'text-primary-dark' : 'text-muted'}`} />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm ${highlighted ? 'text-primary-dark' : 'text-ink'}`}>{entry.title}</p>
          {entry.subtitle && <p className="truncate text-xs text-muted">{entry.subtitle}</p>}
        </div>
      </button>
    )
  }

  const renderViewAllRow = (entry, index) => {
    const highlighted = index === activeIndex
    return (
      <button
        key={`viewall-${entry.type}`}
        type="button"
        onClick={() => selectNavItem(entry)}
        onMouseEnter={() => setActiveIndex(index)}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-1.5 rounded-lg text-left text-xs font-medium transition-colors duration-150
          ${highlighted ? 'bg-primary/10 text-primary-dark' : 'text-primary-dark hover:bg-bg'}`}
      >
        View all results in {entry.label}
        <ChevronRight size={13} />
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
                Search results for "{query.trim()}"
              </p>

              {pageMatches.length > 0 && (() => {
                let idx = -1
                return (
                  <div className="mb-1">
                    <div className="flex items-center gap-1.5 px-3.5 pt-1 pb-1">
                      <LayoutGrid size={11} className="text-muted" />
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wide">Pages</p>
                    </div>
                    <div className="px-1.5 space-y-0.5">
                      {pageMatches.map((p) => {
                        idx += 1
                        return renderPageRow({ kind: 'page', type: p.id, path: p.path, title: p.label }, idx)
                      })}
                    </div>
                  </div>
                )
              })()}

              {loading && (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
                  <Loader2 size={15} className="animate-spin" /> Searching…
                </div>
              )}

              {!loading && errorMsg && (
                <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-ink">{errorMsg}</p>
                </div>
              )}

              {!loading && !errorMsg && results.length === 0 && pageMatches.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <SearchX size={22} className="text-muted" />
                  <p className="text-sm font-medium text-ink">No results found</p>
                  <p className="text-xs text-muted">
                    Try searching for users, customers, suppliers, transactions, invoices, or other records.
                  </p>
                </div>
              )}

              {!loading && !errorMsg && results.length > 0 && (() => {
                let runningIndex = pageMatches.length - 1
                return results.map((group) => {
                  const Icon = ICON_MAP[group.type] || Search
                  return (
                    <div key={group.type} className="mb-1 last:mb-0">
                      <div className="flex items-center gap-1.5 px-3.5 pt-2 pb-1">
                        <Icon size={11} className="text-muted" />
                        <p className="text-[11px] font-medium text-muted uppercase tracking-wide">
                          {group.label}
                        </p>
                      </div>
                      <div className="px-1.5 space-y-0.5">
                        {group.items.map((item) => {
                          runningIndex += 1
                          return renderItemRow(
                            { kind: 'result', type: group.type, route: group.route, label: group.label, ...item },
                            runningIndex
                          )
                        })}
                        {group.has_more && (() => {
                          runningIndex += 1
                          return renderViewAllRow(
                            { kind: 'viewAll', type: group.type, route: group.route, label: group.label },
                            runningIndex
                          )
                        })()}
                      </div>
                    </div>
                  )
                })
              })()}
            </>
          ) : (
            <>
              {recent.length > 0 ? (
                <>
                  <div className="flex items-center justify-between px-3.5 pt-1.5 pb-1">
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
                    {recent.map((item, i) => renderItemRow({ kind: 'recent', ...item }, i))}
                  </div>
                </>
              ) : (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-muted">Search users, customers, transactions, invoices...</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}