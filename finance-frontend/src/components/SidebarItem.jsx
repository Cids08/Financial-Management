import { ChevronDown } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

export default function SidebarItem({ item, collapsed, onNavigate, onLogoutClick, badge, groupOpen = false, onToggleGroup }) {
  const location = useLocation()
  const hasChildren = Array.isArray(item.children) && item.children.length > 0

  const isChildActive =
    hasChildren && item.children.some((child) => child.path === location.pathname)

  const Icon = item.icon

  const baseLinkClasses = ({ isActive }) =>
    `group relative flex items-center gap-3 rounded-xl py-2.5 text-[13px] font-medium
     transition-all duration-150 ease-in-out-smooth
     ${collapsed ? 'px-3 lg:justify-center lg:px-0' : 'px-3'}
     ${
       isActive
         ? 'bg-primary text-black font-semibold shadow-sm'
         : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-ink'
     }`

  // Left accent bar rendered only for the active item  -  extra visual cue
  // beyond the fill color so the current page is unmistakable.
  const ActiveBar = ({ isActive }) =>
    isActive ? (
      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-x-3 -translate-y-1/2 rounded-r-full bg-primary" />
    ) : null

  // Unread-style badge for a leaf item. Expanded: a numeric pill pushed to
  // the end of the row (99+ cap so it never stretches the sidebar width).
  // Collapsed: just a small dot on the icon's corner  -  no room for a
  // number at that width, and a dot is enough to say "something's here".
  const hasBadge = typeof badge === 'number' && badge > 0
  const BadgePill = () =>
    hasBadge ? (
      <span className={`ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-white px-1.5 text-[10px] font-bold leading-none text-black ${collapsed ? 'lg:hidden' : ''}`}>
        {badge > 99 ? '99+' : badge}
      </span>
    ) : null
  const BadgeDot = () =>
    hasBadge ? (
      <span className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-white ring-2 ring-sidebar lg:block" />
    ) : null

  // Grouped modules keep the navigation compact; the current route opens its group.
  if (hasChildren) {
    return (
      <li className="pt-2 mt-2 border-t border-sidebar-border">
        <button type="button" onClick={onToggleGroup} aria-expanded={groupOpen} aria-controls={'nav-group-' + item.id} aria-label={item.label} title={collapsed ? item.label : undefined}
          className={'flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition-colors hover:bg-sidebar-hover ' + (isChildActive ? 'text-primary ' : 'text-sidebar-ink ') + (collapsed ? 'lg:justify-center lg:px-0' : '')}>
          <Icon size={17} strokeWidth={1.8} className="shrink-0" />
          <span className={'min-w-0 flex-1 truncate ' + (collapsed ? 'lg:hidden' : '')}>{item.label}</span>
          <ChevronDown size={14} className={'shrink-0 text-sidebar-muted transition-transform ' + (groupOpen ? 'rotate-180 ' : '') + (collapsed ? 'lg:hidden' : '')} />
        </button>
        <ul id={'nav-group-' + item.id} hidden={!groupOpen} className={'space-y-0.5 pt-1 ' + (collapsed ? 'lg:hidden' : '')}>
          {item.children.map((child) => (
            <li key={child.id}>
              <NavLink
                to={child.path}
                onClick={onNavigate}
                className={baseLinkClasses}
                aria-label={child.label}
                title={collapsed ? child.label : undefined}
              >
                {({ isActive }) => (
                  <>
                    <ActiveBar isActive={isActive} />
                    <child.icon size={17} className="shrink-0" strokeWidth={1.8} />
                    <span className={`min-w-0 whitespace-normal break-words leading-5 ${collapsed ? 'lg:hidden' : ''}`}>{child.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </li>
    )
  }

  // Logout item  -  button, not a route link, so it can trigger a confirm modal
  if (item.isLogout) {
    return (
      <li>
        <button
          type="button"
          onClick={onLogoutClick}
          aria-label={item.label}
          title={collapsed ? item.label : undefined}
          className={`group relative flex w-full items-center gap-3 rounded-xl py-2.5 text-[13px] font-medium text-left
            transition-all duration-150 ease-in-out-smooth
            ${collapsed ? 'px-3 lg:justify-center lg:px-0' : 'px-3'}
            text-sidebar-muted hover:bg-sidebar-hover hover:text-primary`}
        >
          <Icon size={19} className="shrink-0" strokeWidth={1.8} />
          <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
        </button>
      </li>
    )
  }

  // Simple leaf item (no children)
  return (
    <li>
      <NavLink
        to={item.path}
        onClick={onNavigate}
        className={baseLinkClasses}
        aria-label={hasBadge ? `${item.label}, ${badge} unread` : item.label}
        title={collapsed ? `${item.label}${hasBadge ? ` (${badge})` : ''}` : undefined}
      >
        {({ isActive }) => (
          <>
            <ActiveBar isActive={isActive} />
            <span className="relative shrink-0">
              <Icon size={19} strokeWidth={1.8} />
              {collapsed && <BadgeDot />}
            </span>
            <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
            <BadgePill />
          </>
        )}
      </NavLink>
    </li>
  )
}
