import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Car, PlusCircle, ClipboardCheck,
  BarChart3, KeyRound, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthContext } from '@/contexts/AuthContext'

export function MobileNav() {
  const { pathname } = useLocation()
  const { role } = useAuthContext()

  const items =
    role === 'admin'
      ? [
          { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/approvals', label: 'Aprovações', icon: ClipboardCheck },
          { to: '/trips', label: 'Viagens', icon: Car },
          { to: '/admin/access-codes', label: 'Códigos', icon: KeyRound },
          { to: '/drivers', label: 'Usuários', icon: Users },
        ]
      : role === 'supervisor'
      ? [
          { to: '/approvals', label: 'Aprovações', icon: ClipboardCheck },
          { to: '/trips', label: 'Viagens', icon: Car },
          { to: '/reports', label: 'Relatórios', icon: BarChart3 },
        ]
      : [
          { to: '/dashboard', label: 'Início', icon: LayoutDashboard },
          { to: '/trips/new', label: 'Nova', icon: PlusCircle, primary: true },
          { to: '/trips', label: 'Viagens', icon: Car },
          { to: '/reports', label: 'Relatórios', icon: BarChart3 },
        ]

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-md border-t border-border safe-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {items.map((item) => {
          const isActive = pathname === item.to || pathname.startsWith(item.to + '/')
          const isPrimary = (item as { primary?: boolean }).primary
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[56px] touch-target transition-colors',
                isActive && !isPrimary && 'text-primary',
                !isActive && !isPrimary && 'text-muted-foreground hover:text-foreground',
                isPrimary && 'bg-primary text-primary-foreground rounded-2xl shadow-lg shadow-primary/30 scale-110',
              )}
            >
              <item.icon className={cn('h-5 w-5', isPrimary && 'h-6 w-6')} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
