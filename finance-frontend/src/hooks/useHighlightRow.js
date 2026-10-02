import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Reads a `highlightId` (and optional `highlightSearch`) passed via
 * router state  -  SearchBar.jsx navigates with
 * `navigate(path, { state: { highlightId, highlightSearch } })` whenever
 * a specific database record is clicked from search results. This hook:
 *
 *  1. Picks up that id (and search hint) on mount.
 *  2. Immediately scrubs the router state (via a `replace` navigation to
 *     the same path) so refreshing the page or navigating back to it
 *     later doesn't re-trigger the same highlight.
 *  3. Scrolls the matching row into view, found via a `data-row-id`
 *     attribute the list page adds to each row.
 *  4. Clears the highlight automatically after a few seconds.
 *
 * Usage in a list page whose table already loads everything client-side
 * (Users.jsx, AccountsReceivable.jsx  -  no seeding needed, the row is
 * already in memory):
 *
 *   const { highlightedId } = useHighlightRow()
 *   ...
 *   <tr data-row-id={u.user_id} className={highlightedId === u.user_id ? 'bg-primary/10' : 'hover:bg-bg'}>
 *
 * Usage in a list page whose table is filtered server-side by its own
 * `search` box (Customers.jsx, Suppliers.jsx, Expenses.jsx, ...)  -  the
 * target record may not be on whatever page/filter is currently loaded,
 * so seed that page's own search state with `highlightSearch` first:
 *
 *   const { highlightedId, highlightSearch } = useHighlightRow()
 *   useEffect(() => {
 *     if (highlightSearch == null) return
 *     setSearch(highlightSearch)
 *     setStatusFilter('all')
 *     setShowArchived(false)
 *     setPage(1)
 *   }, [highlightSearch])
 *
 * The row's own id field name differs per page (user_id, id, ar_id,
 * etc.)  -  that's fine, this hook only ever hands back the raw id value;
 * each page compares it against whichever field it already uses as the
 * row key.
 */
const HIGHLIGHT_DURATION_MS = 3000
const SCROLL_DELAY_MS = 120 // gives the table a moment to render/filter before we try to scroll
// Server-filtered pages need extra time after seeding `search` for their
// own debounce + fetch round trip to resolve before we try to scroll  - 
// longer than SCROLL_DELAY_MS, which only covers a purely local re-render.
const SEEDED_SCROLL_DELAY_MS = 500

export function useHighlightRow() {
  const location = useLocation()
  const navigate = useNavigate()
  const incomingId = location.state?.highlightId ?? null
  const incomingSearch = location.state?.highlightSearch ?? null

  const [highlightedId, setHighlightedId] = useState(null)
  const [highlightSearch, setHighlightSearch] = useState(null)
  const clearTimerRef = useRef(null)
  const scrollTimerRef = useRef(null)

  // Highlight timers live as long as the mounted page. The state-scrub
  // navigation below MUST NOT cancel them -  if they were torn down there,
  // the highlight would persist forever and the row would never scroll
  // (the scrub re-renders with a null state, re-running the other effect,
  // and its cleanup used to cancel both pending timers before they fired).
  useEffect(() => {
    return () => {
      clearTimeout(scrollTimerRef.current)
      clearTimeout(clearTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (incomingId == null) return

    // A fresh highlight arriving while a previous one is still pending
    // (search > click, search again > click another row) -  drop the old
    // timers so its auto-clear can't cancel the new highlight.
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)

    setHighlightedId(incomingId)
    setHighlightSearch(incomingSearch)

    // Scrub immediately so back/refresh doesn't replay the same highlight.
    // Preserve the query string  -  some pages (Collections, Expenses,
    // Users, ...) hold their filters in the URL.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} })

    scrollTimerRef.current = setTimeout(() => {
      document
        .querySelector(`[data-row-id="${incomingId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, incomingSearch ? SEEDED_SCROLL_DELAY_MS : SCROLL_DELAY_MS)

    clearTimerRef.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingId, incomingSearch])

  return { highlightedId, highlightSearch }
}