import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import Footer from '../components/Footer'
import LogoutConfirmModal from '../components/LogoutConfirmModal'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { ProfileProvider } from '../context/ProfileContext'

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useLocalStorage('fms-sidebar-collapsed', false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)

  // On desktop the hamburger toggles collapse; on mobile it opens the drawer.
  const handleHeaderToggle = () => {
    if (window.innerWidth >= 1024) {
      setCollapsed((c) => !c)
    } else {
      setMobileOpen((o) => !o)
    }
  }

  return (
    // Wrapping here (rather than higher up in App.jsx) means Header and
    // every page rendered through <Outlet /> — including Profile —
    // share the exact same profile fetch and state. Update the avatar
    // from the Profile page and the Header updates in the same render,
    // no separate re-fetch, no drift.
    <ProfileProvider>
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
    </ProfileProvider>
  )
}