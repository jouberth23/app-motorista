import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, PlusCircle } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { Button } from '@/components/ui/button'
import { MobileNav } from './MobileNav'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useAuthContext } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const { isOnline } = useOfflineQueue()
  const { role } = useAuthContext()
  const { isMotorista } = useRole(role)

  const pageTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/trips': 'Viagens',
    '/trips/new': 'Nova Viagem',
    '/approvals': 'Aprovações',
    '/reports': 'Relatórios',
    '/drivers': 'Motoristas',
    '/audit': 'Auditoria',
    '/profile': 'Perfil',
    '/settings': 'Configurações',
  }

  const currentTitle = Object.entries(pageTitles).find(([key]) =>
    pathname === key || pathname.startsWith(key + '/'),
  )?.[1] ?? 'TaxiVoucher'

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 border-r border-border">
        <AppSidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-72 border-r border-border lg:hidden"
            >
              <AppSidebar onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center h-14 px-4 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0 safe-top">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden touch-target rounded-lg hover:bg-secondary mr-2"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0">
            <h2 className="font-display text-base font-semibold truncate">{currentTitle}</h2>
          </div>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Offline
              </div>
            )}
            {isMotorista && (
              <Button size="sm" asChild>
                <Link to="/trips/new">
                  <PlusCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Nova Viagem</span>
                </Link>
              </Button>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="page-container pb-24 lg:pb-8">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <MobileNav />
      </div>
    </div>
  )
}
