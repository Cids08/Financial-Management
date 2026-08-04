import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, User, Settings, LogOut, Sun, Moon } from 'lucide-react'
import SearchBar from './SearchBar'
import Notification from './Notification'
import { useClickOutside } from '../hooks/useClickOutside'
import { useTheme } from '../context/ThemeContext'
import { useProfile } from '../hooks/useProfile'
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

export default function Header({ onToggleSidebar, collapsed, onLogoutClick }) {
  // Header now pulls the user's identity straight from the backend
  // (same useProfile() hook the Profile page uses) instead of depending
  // on a parent layout to fetch it and pass userName/avatarUrl down as
  // props — one source of truth, no risk of the two views drifting.
  const { profile, loading: profileLoading } = useProfile()

  const [profileOpen, setProfileOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [imgError, setImgError] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
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

  const goTo = (path) => {
    setProfileOpen(false)
    navigate(path)
  }

  const profileMenuItems = [
    { id: 'profile', label: 'My Profile', icon: User, onClick: () => goTo(PROFILE_PATH) },
    { id: 'settings', label: 'Account Settings', icon: Settings, onClick: () => goTo(SETTINGS_PATH) },
    {
      id: 'logout',
      label: 'Logout',
      icon: LogOut,
      danger: true,
      divider: true,
      onClick: () => {
        setProfileOpen(false)
        onLogoutClick?.()
      },
    },
  ]

  const Avatar = ({ size }) => (
    <div className={`${size} rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden`}>
      {showImage ? (
        <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <span className="text-primary-dark font-semibold text-xs">{initials}</span>
      )}
    </div>
  )

  return (
    <header
      className={`fixed top-0 left-0 right-0 h-16 bg-surface border-b border-border shadow-header z-40
        flex items-center justify-between px-4 lg:px-6
        transition-all duration-300 ease-in-out-smooth
        ${collapsed ? 'lg:pl-20' : 'lg:pl-70'}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative group shrink-0">
          <button
            onClick={onToggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-ink
              hover:bg-bg active:bg-border/60 transition-colors duration-150"
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

        <div className={`${collapsed ? 'block' : 'hidden sm:block'} min-w-0 leading-tight`}>
          {profileLoading ? (
            <div className="h-8 w-40 rounded bg-bg animate-pulse" />
          ) : (
            <>
              <p className="text-sm font-semibold text-ink truncate">
                {greeting}, <span className="text-primary-dark">{firstName}</span>
              </p>
              <p className="text-xs text-muted truncate">{dateLabel} · {timeLabel}</p>
            </>
          )}
        </div>
      </div>

      <div className="hidden md:block flex-1 max-w-lg mx-6">
        <SearchBar />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          className="flex items-center justify-center w-9 h-9 rounded-lg
            text-muted hover:text-ink hover:bg-bg transition-colors duration-150"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <Notification />
        <div className="w-px h-7 bg-border mx-1 hidden sm:block" />

        <div className="relative" ref={ref}>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2.5 pl-1.5 pr-2 py-1.5 rounded-lg hover:bg-bg transition-colors duration-150"
          >
            <Avatar size="w-8 h-8" />
            <div className={`${collapsed ? 'block' : 'hidden lg:block'} text-left leading-tight`}>
              <p className="text-sm font-semibold text-ink">{userName}</p>
              <p className="text-xs text-muted">{role}</p>
            </div>
            <ChevronDown
              size={15}
              className={`${collapsed ? 'block' : 'hidden lg:block'} text-muted transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-surface rounded-xl border border-border
                shadow-dropdown animate-fadeIn origin-top-right z-50 py-1.5">
              <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-2.5">
                <Avatar size="w-9 h-9" />
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
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors duration-150
                      ${danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-ink hover:bg-bg'}`}
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
}