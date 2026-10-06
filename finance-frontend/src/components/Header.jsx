import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, User, Settings, LogOut, Sun, Moon, Eye, EyeOff } from 'lucide-react'
import SearchBar from './SearchBar'
import Notification from './Notification'
import { useClickOutside } from '../hooks/useClickOutside'
import { useTheme } from '../context/ThemeContext'
import { useProfile } from '../hooks/useProfile'
import { usePrivacy } from '../context/PrivacyContext'
import { usePermissions } from '../context/PermissionsContext'
import { menuData } from '../utils/menuData'

function getGreeting(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

const SETTINGS_PATH = menuData.find((item) => item.id === 'settings')?.path || '/settings'
const PROFILE_PATH = '/profile'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

// Pure presentational  -  hoisted out of the render body so it isn't
// recreated (and re-verified against React's reconciler) on every render.
function ProfileAvatar({ size, showImage, url, name, initials, onError }) {
  return (
    <div className={`${size} rounded-xl bg-primary flex items-center justify-center shrink-0 overflow-hidden`}>
      {showImage ? (
        <img src={url} alt={name} className="w-full h-full object-cover" onError={onError} />
      ) : (
        <span className="text-black font-bold text-xs">{initials}</span>
      )}
    </div>
  )
}

export default memo(function Header({ onToggleSidebar, collapsed, onLogoutClick }) {
  // Header now pulls the user's identity straight from the backend
  // (same useProfile() hook the Profile page uses) instead of depending
  // on a parent layout to fetch it and pass userName/avatarUrl down as
  // props  -  one source of truth, no risk of the two views drifting.
  const { profile, loading: profileLoading } = useProfile()

  const [profileOpen, setProfileOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [imgError, setImgError] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { privacyOn, togglePrivacy, cooldownActive } = usePrivacy()
  const { hasPermission } = usePermissions()
  const canManageSettings = hasPermission('settings.manage')
  useClickOutside(ref, () => setProfileOpen(false))

  useEffect(() => {
    let timeoutId, intervalId
    const alignToMinute = () => {
      setNow(new Date())
      const msToNextMinute = 60000 - (Date.now() % 60000)
      timeoutId = setTimeout(() => {
        setNow(new Date())
        intervalId = setInterval(() => setNow(new Date()), 60000)
      }, msToNextMinute)
    }
    alignToMinute()
    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [])

  // Give a freshly loaded/updated avatarUrl a clean chance to render,
  // same pattern as Profile.jsx.
  useEffect(() => {
    setImgError(false)
  }, [profile?.avatarUrl])

  const userName = profile?.name || 'User'
  const role = profile?.role || ''
  const avatarUrl = profile?.avatar_url

  const firstName = userName.split(' ')[0]
  const greeting = getGreeting(now.getHours())
  const dateLabel = dateFormatter.format(now)
  const timeLabel = timeFormatter.format(now)
  const initials = getInitials(userName)
  const showImage = avatarUrl && !imgError

  // Stable identity so the memo-wrapped Header's re-render scope stays tight.
  const goTo = useCallback((path) => {
    setProfileOpen(false)
    navigate(path)
  }, [navigate])

  // Settings is org config (settings.manage)  -  for everyone else the
  // dropdown is just My Profile + Logout, mirroring the sidebar footer.
  const profileMenuItems = useMemo(() => {
    const items = [
      { id: 'profile', label: 'My Profile', icon: User, onClick: () => goTo(PROFILE_PATH) },
    ]
    if (canManageSettings) {
      items.push({ id: 'settings', label: 'Settings', icon: Settings, onClick: () => goTo(SETTINGS_PATH) })
    }
    items.push({
      id: 'logout',
      label: 'Logout',
      icon: LogOut,
      danger: true,
      divider: true,
      onClick: () => {
        setProfileOpen(false)
        onLogoutClick?.()
      },
    })
    return items
  }, [canManageSettings, goTo, onLogoutClick])

  return (
    <header
      className={`workspace-header fixed top-0 left-0 right-0 h-20 bg-surface/95 backdrop-blur-md border-b border-border z-40
        flex items-center justify-between gap-3 px-4 lg:px-7
        transition-all duration-300 ease-in-out-smooth
        ${collapsed ? 'lg:left-20' : 'lg:left-70'}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative group shrink-0">
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle navigation"
            aria-controls="workspace-navigation"
            className="flex items-center justify-center w-10 h-10 rounded-xl border border-border text-muted
              hover:text-ink hover:bg-bg active:bg-border/60 transition-colors duration-150"
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <span
            className="pointer-events-none absolute top-full left-0 mt-2
              whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-bg
              opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100
              transition-all duration-150 z-50"
          >
            {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          </span>
        </div>

        <div className="hidden sm:block min-w-0 leading-tight">
          {profileLoading ? (
            <div className="h-8 w-40 rounded bg-bg animate-pulse" />
          ) : (
            <>
              <p className="text-sm font-semibold text-ink truncate">
                {greeting}, <span className="text-primary-dark">{firstName}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted truncate">{dateLabel} <span className="px-1" aria-hidden="true">/</span> {timeLabel}</p>
            </>
          )}
        </div>
      </div>

      <div className="hidden md:block flex-1 min-w-0 max-w-md mx-1 xl:mx-6">
        <SearchBar />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={togglePrivacy}
          disabled={cooldownActive}
          aria-label={privacyOn ? 'Disable Privacy Mode' : 'Enable Privacy Mode'}
          aria-pressed={privacyOn}
          title={privacyOn ? 'Privacy Mode On - click to reveal amounts' : 'Privacy Mode Off - click to hide amounts'}
          className={`flex h-10 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold border transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed
            ${privacyOn
              ? 'border-primary/30 bg-primary/10 text-primary-dark'
              : 'border-border bg-surface text-muted hover:text-ink hover:border-ink/20'}`}
        >
          {privacyOn ? <EyeOff size={17} /> : <Eye size={17} />}
          <span className="hidden xl:inline">{privacyOn ? 'Privacy On' : 'Privacy Off'}</span>
        </button>

        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center justify-center w-10 h-10 rounded-xl
            text-muted hover:text-ink hover:bg-bg transition-colors duration-150"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <Notification />
        <div className="w-px h-7 bg-border mx-1 hidden sm:block" />

        <div className="relative" ref={ref}>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            aria-label={`Open account menu for ${userName}`}
            aria-expanded={profileOpen}
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-bg transition-colors duration-150"
          >
            <ProfileAvatar size="w-9 h-9" showImage={showImage} url={avatarUrl} name={userName} initials={initials} onError={() => setImgError(true)} />
            <div className="hidden 2xl:block max-w-36 text-left leading-tight">
              <p className="text-sm font-semibold text-ink truncate">{userName}</p>
              <p className="mt-1 text-[11px] text-muted truncate">{role}</p>
            </div>
            <ChevronDown
              size={15}
              className={`hidden 2xl:block text-muted transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-3 w-64 bg-surface rounded-2xl border border-border
                shadow-dropdown animate-fadeIn origin-top-right z-50 p-1.5">
              <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-2.5">
                <ProfileAvatar size="w-9 h-9" showImage={showImage} url={avatarUrl} name={userName} initials={initials} onError={() => setImgError(true)} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{userName}</p>
                  <p className="text-xs text-muted">{role}</p>
                </div>
              </div>

              {profileMenuItems.map(({ id, label, icon: ItemIcon, danger, divider, onClick }) => (
                <div key={id}>
                  {divider && <div className="my-1 border-t border-border" />}
                  <button
                    onClick={onClick}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150
                      ${danger ? 'text-primary-dark hover:bg-primary/10' : 'text-ink hover:bg-bg'}`}
                  >
                    <ItemIcon size={16} className={danger ? '' : 'text-muted'} />
                    {label}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
})
