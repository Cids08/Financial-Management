import { NavLink, useLocation } from 'react-router-dom'

export default function SidebarItem({ item, collapsed, onNavigate, onLogoutClick, badge }) {
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

  // Parent item with children  -  static section, no dropdown
  if (hasChildren) {
    return (
      <li className="pt-4 mt-3 border-t border-sidebar-border first:mt-0 first:pt-0 first:border-t-0">
        <p
          className={`px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] truncate
            ${collapsed ? 'lg:hidden' : ''}
            ${isChildActive ? 'text-primary' : 'text-sidebar-muted'}`}
        >
          {item.label}
        </p>

        <ul className="space-y-1">
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
                    <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{child.label}</span>
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
