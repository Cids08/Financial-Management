import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import Footer from '../components/Footer'
import LogoutConfirmModal from '../components/LogoutConfirmModal'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useAuth } from '../hooks/useAuth'
import { useIdleLogout } from '../hooks/useIdleLogout'
import { ProfileProvider } from '../context/ProfileContext'
import { PermissionsProvider } from '../context/PermissionsContext'
import { NotificationsProvider } from '../context/NotificationsContext'

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useLocalStorage('fms-sidebar-collapsed', false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)

  const { logout } = useAuth()

  // DashboardLayout only ever renders behind ProtectedRoute, so there's
  // always a session here — no need to gate this on an auth-state check.
  // Idle logout is silent (no LogoutConfirmModal) since by definition
  // nobody's present to confirm it; that modal is only for the manual
  // "Log out" button in Header/Sidebar.
  useIdleLogout({ onIdle: logout, timeoutMinutes: 20 })

  // On desktop the hamburger toggles collapse; on mobile it opens the drawer.
  const handleHeaderToggle = () => {
    if (window.innerWidth >= 1024) {
      setCollapsed((c) => !c)
    } else {
      setMobileOpen((o) => !o)
    }
  }

  return (
    <ProfileProvider>
      <PermissionsProvider>
        {/* Mounted once here — Header's bell, Sidebar's badge, and the
            Notifications page all consume this same instance via
            useNotificationsContext() instead of each calling
            useNotifications() on their own. That's what keeps them in
            sync: mark something read on the page and the sidebar/header
            badge update immediately, not on the next 30s poll. */}
        <NotificationsProvider>
          <div className="min-h-screen bg-bg">
            <Header
              onToggleSidebar={handleHeaderToggle}
              collapsed={collapsed}
              onLogoutClick={() => setLogoutModalOpen(true)}
            />

            <Sidebar
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed((c) => !c)}
              mobileOpen={mobileOpen}
              onCloseMobile={() => setMobileOpen(false)}
              onLogoutClick={() => setLogoutModalOpen(true)}
            />

            <div
              className={`pt-16 flex flex-col min-h-screen transition-all duration-300 ease-in-out-smooth
                ${collapsed ? 'lg:pl-20' : 'lg:pl-70'}
              `}
            >
              <main className="flex-1 p-4 sm:p-6">
                <Outlet />
              </main>
              <Footer />
            </div>

            <LogoutConfirmModal open={logoutModalOpen} onClose={() => setLogoutModalOpen(false)} />
          </div>
        </NotificationsProvider>
      </PermissionsProvider>
    </ProfileProvider>
  )
}