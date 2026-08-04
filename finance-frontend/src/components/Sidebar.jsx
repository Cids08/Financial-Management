import { useEffect, useRef, useState } from 'react'
import { Landmark, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown } from 'lucide-react'
import { menuData } from '../utils/menuData'
import { useCompany } from '../context/CompanyContext'
import SidebarItem from './SidebarItem'

// Account-level actions live in a pinned footer, not the scrollable work nav
const FOOTER_IDS = ['settings', 'logout']

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile, onLogoutClick }) {
  const navRef = useRef(null)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const { name, tagline, logoUrl } = useCompany()

  const mainItems = menuData.filter((item) => !FOOTER_IDS.includes(item.id))
  const footerItems = menuData.filter((item) => FOOTER_IDS.includes(item.id))

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
  }, [collapsed, mobileOpen])

  const scrollBy = (amount) => {
    navRef.current?.scrollBy({ top: amount, behavior: 'smooth' })
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-ink/50 z-40 lg:hidden animate-fadeIn"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full bg-sidebar border-r border-sidebar-border z-50 flex flex-col
          transition-all duration-300 ease-in-out-smooth
          ${collapsed ? 'lg:w-20' : 'lg:w-70'}
          w-70
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Brand / logo row — reads from CompanyContext, editable in Settings */}
        <div className="h-16 flex items-center gap-2.5 px-4 border-b border-sidebar-border shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <Landmark size={18} className="text-[#111827]" />
            )}
          </div>
          {/* Label hides only when collapsed AND on desktop; mobile drawer is always full width */}
          <div className={`min-w-0 block ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="text-sm font-bold text-sidebar-ink leading-tight truncate">{name}</p>
            <p className="text-[11px] text-sidebar-muted leading-tight truncate">{tagline}</p>
          </div>
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
            className="h-full overflow-y-auto overflow-x-hidden scrollbar-none py-4 px-3"
          >
            <ul className="space-y-1">
              {mainItems.map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onCloseMobile}
                />
              ))}
            </ul>
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
        <div className="shrink-0 border-t border-sidebar-border px-3 py-2">
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
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center gap-2 mx-3 mb-4 py-2.5 rounded-lg
            text-sidebar-muted hover:text-sidebar-ink hover:bg-sidebar-hover transition-colors duration-150 shrink-0"
        >
          {collapsed ? <ChevronsRight size={18} /> : (
            <>
              <ChevronsLeft size={18} />
              <span className="text-xs font-medium">Collapse</span>
            </>
          )}
        </button>
      </aside>
    </>
  )
}