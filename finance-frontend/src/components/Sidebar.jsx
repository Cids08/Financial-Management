import { useProfile } from '../hooks/useProfile'
import { useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Landmark, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown, Search, X } from 'lucide-react'
import { menuData, collectorMenuData } from '../utils/menuData'
import { filterMenuByPermissions } from '../utils/permissions'
import { useCompany } from '../context/CompanyContext'
import { usePermissions } from '../context/PermissionsContext'
import { useNotificationsContext } from '../context/NotificationsContext'
import SidebarItem from './SidebarItem'

// Account-level actions live in a pinned footer, not the scrollable work nav
const FOOTER_IDS = ['settings', 'logout']

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile, onLogoutClick }) {
  const navRef = useRef(null)
  const location = useLocation()
  const [menuSearch, setMenuSearch] = useState('')
  const [openGroup, setOpenGroup] = useState(null)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const { name, tagline, logoUrl } = useCompany()

  // THE FIX: filterMenuByPermissions() expects a flat array of
  // permission_name strings (e.g. ['users.view', 'ap.manage'])  -  exactly
  // what GET /api/me/permissions returns via usePermissions(). The
  // previous version passed useAuth()'s `user` object here instead, which
  // has no .includes() method, so every gated item's hasPermission() check
  // failed and only ungated items (Dashboard, Settings, Logout) survived.
  const { permissions, loading: permissionsLoading, error: permissionsError, refetch: reloadPermissions } = usePermissions()

  const { profile } = useProfile()
  const isCollector = profile?.role_slug === 'collector' || profile?.role?.toLowerCase() === 'collector'
  const navigationData = isCollector ? collectorMenuData : menuData
  const visibleMenuData = filterMenuByPermissions(navigationData, permissions).filter(item => item.id !== 'settings')
  const mainItems = visibleMenuData.filter((item) => !FOOTER_IDS.includes(item.id))
  const footerItems = visibleMenuData.filter((item) => FOOTER_IDS.includes(item.id))
  const term = menuSearch.trim().toLowerCase()
  const searchedItems = mainItems.flatMap(item => {
    if (!term || item.label.toLowerCase().includes(term)) return [item]
    if (!item.children) return []
    const children = item.children.filter(child => child.label.toLowerCase().includes(term))
    return children.length ? [{ ...item, children }] : []
  })
  useEffect(() => {
    const active = navigationData.find(item => item.children?.some(child => child.path === location.pathname))
    setOpenGroup(active?.id || null)
    setMenuSearch('')
  }, [location.pathname, navigationData])

  // Unread badge for the Notifications sidebar item. Reads the shared
  // NotificationsContext (mounted once in DashboardLayout) instead of its
  // own useNotifications() instance  -  fetching and polling now happen in
  // exactly one place, and marking something read elsewhere (Header's
  // bell, the Notifications page) updates this badge immediately since
  // they all share the same state.
  const { unreadCount } = useNotificationsContext()

  const updateScrollState = () => {
    const el = navRef.current
    if (!el) return
    setCanScrollUp(el.scrollTop > 4)
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }

  useEffect(() => {
    updateScrollState()
    const el = navRef.current
    if (!el) return

    const handle = () => updateScrollState()
    el.addEventListener('scroll', handle)
    window.addEventListener('resize', handle)

    // Recalculate after layout settles (e.g. collapse animation, menu render)
    const timeout = setTimeout(updateScrollState, 320)

    return () => {
      el.removeEventListener('scroll', handle)
      window.removeEventListener('resize', handle)
      clearTimeout(timeout)
    }
  }, [collapsed, mobileOpen, permissionsLoading, permissions, openGroup, menuSearch])

  const scrollBy = (amount) => {
    navRef.current?.scrollBy({ top: amount, behavior: 'smooth' })
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fadeIn"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        id="workspace-navigation"
        aria-label="Workspace navigation"
        className={`fixed top-0 left-0 h-dvh bg-sidebar border-r border-sidebar-border z-50 flex flex-col
          transition-all duration-300 ease-in-out-smooth
          ${collapsed ? 'lg:w-20' : 'lg:w-70'}
          w-70
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Brand / logo row  -  reads from CompanyContext, editable in Settings */}
        <div className="workspace-brand h-20 flex items-center gap-3 px-5 border-b border-sidebar-border shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
            {logoUrl ? (
              <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <Landmark size={21} className="text-black" strokeWidth={1.8} />
            )}
          </div>
          {/* Label hides only when collapsed AND on desktop; mobile drawer is always full width */}
          <div className={`min-w-0 block ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="text-sm font-bold text-sidebar-ink leading-tight tracking-tight truncate">{name}</p>
            <p className="mt-1 text-[10px] text-sidebar-muted leading-tight truncate">{tagline}</p>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="ml-auto rounded-lg p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-ink lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Menu (scroll container) */}
        <div className="relative flex-1 min-h-0">
          {/* Scroll-up indicator */}
          {canScrollUp && (
            <button
              onClick={() => scrollBy(-140)}
              aria-label="Scroll up"
              className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center h-6
                bg-linear-to-b from-sidebar to-transparent text-sidebar-muted hover:text-sidebar-ink
                transition-colors duration-150"
            >
              <ChevronUp size={16} />
            </button>
          )}

          <nav
            ref={navRef}
            aria-label="Main navigation"
            aria-busy={permissionsLoading}
            className="h-full overflow-y-auto overflow-x-hidden scrollbar-none py-5 px-3"
          >
            <div className={'relative mb-4 ' + (collapsed ? 'lg:hidden' : '')}>
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sidebar-muted" />
              <input type="search" aria-label="Find a menu item" placeholder="Find a menu item..." value={menuSearch} onChange={e => setMenuSearch(e.target.value)} className="h-9 w-full min-w-0 rounded-lg border border-sidebar-border bg-sidebar pl-9 pr-3 text-xs text-sidebar-ink placeholder:text-sidebar-muted focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <p className={`px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted ${collapsed ? 'lg:hidden' : ''}`}>
              Workspace
            </p>
            {permissionsError && <div role="alert" className="mb-3 rounded-lg border border-sidebar-muted/30 p-3 text-xs text-sidebar-ink"><p>Navigation could not load.</p><button type="button" onClick={reloadPermissions} className="mt-2 font-semibold text-primary">Retry</button></div>}
            <ul className="space-y-1">
              {permissionsLoading ? menuData.filter(item => !FOOTER_IDS.includes(item.id)).map(item => {
                const pendingItems = item.children ? [] : [item]
                return <li key={item.id} aria-busy="true" className={item.children ? 'pt-4 mt-3 border-t border-sidebar-border' : ''}>
                  {item.children && <p className={'px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted ' + (collapsed ? 'lg:hidden' : '')}>{item.label}</p>}
                  <ul className="space-y-1">{pendingItems.map(entry => <li key={entry.id}>
                    <div aria-disabled="true" className={'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-sidebar-muted ' + (collapsed ? 'lg:justify-center lg:px-0' : '')}>
                      <entry.icon size={17} strokeWidth={1.8} className="shrink-0" />
                      <span className={'truncate ' + (collapsed ? 'lg:hidden' : '')}>{entry.label}</span>
                    </div>
                  </li>)}</ul>
                </li>
              }) : searchedItems.map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  groupOpen={!!term || openGroup === item.id}
                  onToggleGroup={() => {
                    if (collapsed && !mobileOpen) { onToggleCollapse(); setOpenGroup(item.id); return }
                    if (term) { setMenuSearch(''); setOpenGroup(item.id); return }
                    setOpenGroup(current => current === item.id ? null : item.id)
                  }}
                  collapsed={collapsed}
                  onNavigate={() => { setMenuSearch(''); onCloseMobile?.() }}
                  badge={item.id === 'notifications' ? unreadCount : undefined}
                />
              ))}
            </ul>
            {!permissionsLoading && searchedItems.length === 0 && <p role="status" className="px-3 py-6 text-xs text-sidebar-muted">No menu items match your search.</p>}
          </nav>

          {/* Scroll-down indicator */}
          {canScrollDown && (
            <button
              onClick={() => scrollBy(140)}
              aria-label="Scroll down"
              className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center h-6
                bg-linear-to-t from-sidebar to-transparent text-sidebar-muted hover:text-sidebar-ink
                transition-colors duration-150"
            >
              <ChevronDown size={16} />
            </button>
          )}
        </div>

        {/* Pinned account actions (always visible, never scrolls) */}
        <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
          <ul className="space-y-1">
            {footerItems.map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                collapsed={collapsed}
                onNavigate={onCloseMobile}
                onLogoutClick={onLogoutClick}
              />
            ))}
          </ul>
        </div>

        {/* Collapse toggle (desktop only) */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          className="hidden lg:flex items-center justify-center gap-2 mx-3 mb-4 py-2.5 rounded-xl border border-sidebar-border
            text-sidebar-muted hover:text-sidebar-ink hover:bg-sidebar-hover transition-colors duration-150 shrink-0"
        >
          {collapsed ? <ChevronsRight size={18} /> : (
            <>
              <ChevronsLeft size={18} />
              <span className="text-xs font-medium">Collapse navigation</span>
            </>
          )}
        </button>
      </aside>
    </>
  )
}
