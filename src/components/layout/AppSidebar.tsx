import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Car, PlusCircle, ClipboardCheck, BarChart3,
  Users, Shield, Settings, LogOut, ChevronRight, Wifi, WifiOff,
  KeyRound, AlertCircle, Send, Clock, Building2,
} from 'lucide-react'
import { cn, initials } from '@/lib/utils'
import { useAuthContext } from '@/contexts/AuthContext'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { APP_NAME, ROLE_LABELS } from '@/lib/constants'
import { toast } from 'sonner'
import type { AppRole } from '@/types/enums'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  highlight?: boolean
}

interface NavSection {
  group?: string
  items: NavItem[]
}

const motoristaNav: NavSection[] = [
  {
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/trips/new', label: 'Nova Viagem', icon: PlusCircle, highlight: true },
      { to: '/trips', label: 'Minhas Viagens', icon: Car },
      { to: '/trips?status=pendente', label: 'Correções', icon: AlertCircle },
    ],
  },
]

const supervisorNav: NavSection[] = [
  {
    group: 'CENTRAL',
    items: [
      { to: '/approvals', label: 'Aprovações', icon: ClipboardCheck },
      { to: '/trips?status=enviado', label: 'Viagens Enviadas', icon: Send },
      { to: '/trips?status=pendente', label: 'Em Análise', icon: Clock },
    ],
  },
  {
    group: 'GESTÃO',
    items: [
      { to: '/reports', label: 'Relatórios', icon: BarChart3 },
      { to: '/audit', label: 'Auditoria', icon: Shield },
    ],
  },
]

const adminNav: NavSection[] = [
  {
    group: 'OPERACIONAL',
    items: [
      { to: '/admin/dashboard', label: 'Dashboard Admin', icon: LayoutDashboard },
      { to: '/approvals', label: 'Aprovações', icon: ClipboardCheck },
      { to: '/trips', label: 'Todas as Viagens', icon: Car },
    ],
  },
  {
    group: 'ANÁLISE',
    items: [
      { to: '/reports', label: 'Relatórios Avançados', icon: BarChart3 },
      { to: '/audit', label: 'Auditoria Completa', icon: Shield },
    ],
  },
  {
    group: 'ADMINISTRAÇÃO',
    items: [
      { to: '/drivers', label: 'Motoristas', icon: Users },
      { to: '/admin/access-codes', label: 'Códigos de Acesso', icon: KeyRound },
      { to: '/settings', label: 'Configurações', icon: Settings },
    ],
  },
]

function getNav(role: AppRole | null): NavSection[] {
  if (role === 'admin') return adminNav
  if (role === 'supervisor') return supervisorNav
  return motoristaNav
}

function getSidebarSubtitle(role: AppRole | null): string {
  if (role === 'admin') return 'Painel Administrativo'
  if (role === 'supervisor') return 'Painel Central'
  return 'App Motorista'
}

interface AppSidebarProps {
  onClose?: () => void
}

export function AppSidebar({ onClose }: AppSidebarProps) {
  const { pathname, search } = useLocation()
  const { profile, role, signOut } = useAuthContext()
  const { isOnline } = useOfflineQueue()

  const sections = getNav(role)
  const currentPath = pathname + search

  const isActive = (to: string) => {
    const [toPath] = to.split('?')
    if (to === '/dashboard' || to === '/approvals' || to === '/admin/dashboard') {
      return pathname === toPath
    }
    return currentPath.startsWith(toPath)
  }

  const handleSignOut = async () => {
    try { await signOut(); toast.success('Sessão encerrada') }
    catch { toast.error('Erro ao sair') }
  }

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex-shrink-0">
          {role === 'admin'
            ? <Building2 className="h-5 w-5 text-primary" />
            : role === 'supervisor'
            ? <ClipboardCheck className="h-5 w-5 text-primary" />
            : <Car className="h-5 w-5 text-primary" />}
        </div>
        <div>
          <div className="font-display font-bold text-base text-foreground tracking-tight">{APP_NAME}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {getSidebarSubtitle(role)}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto no-scrollbar">
        {sections.map((section, si) => (
          <div key={si}>
            {section.group && (
              <div className="px-3 pb-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
                  {section.group}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.to)
                return (
                  <Link
                    key={item.to + item.label}
                    to={item.to}
                    onClick={onClose}
                    className={cn(
                      'nav-item',
                      active && 'nav-item-active',
                      item.highlight && !active && 'text-primary hover:bg-primary/10',
                    )}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {active && <ChevronRight className="h-3 w-3 opacity-60" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
          isOnline ? 'text-emerald-400' : 'text-amber-400',
        )}>
          {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {isOnline ? 'Online' : 'Sem conexão'}
        </div>

        <Link to="/profile" onClick={onClose} className="nav-item">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">
              {profile?.nome ? initials(profile.nome) : '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {profile?.nome ?? 'Usuário'}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {role ? ROLE_LABELS[role] : ''}
            </div>
          </div>
        </Link>

        <button
          onClick={handleSignOut}
          className="nav-item w-full text-destructive/70 hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  )
}
