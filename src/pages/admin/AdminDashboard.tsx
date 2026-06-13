import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, Car, ClipboardCheck, KeyRound, Shield,
  TrendingUp, AlertCircle, CheckCircle2,
  ArrowRight, BarChart3,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/common/PageHeader'
import { formatDateTime } from '@/lib/utils'

interface Stats {
  totalUsers: number
  totalTrips: number
  pendingApprovals: number
  approvedToday: number
  activeCodes: number
}

interface RecentAudit {
  id: string
  action: string
  by_user: string
  entity: string
  created_at: string
  user_name?: string
}

export function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalTrips: 0,
    pendingApprovals: 0,
    approvedToday: 0,
    activeCodes: 0,
  })
  const [recentAudit, setRecentAudit] = useState<RecentAudit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const [users, trips, pending, approved, codes, audit] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('trips').select('id', { count: 'exact', head: true }),
        supabase.from('trips').select('id', { count: 'exact', head: true }).in('status', ['enviado', 'pendente']),
        supabase.from('trips').select('id', { count: 'exact', head: true }).eq('status', 'aprovado').gte('approved_at', today.toISOString()),
        supabase.from('access_codes').select('id', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('audit_logs').select('id, action, by_user, entity, created_at').order('created_at', { ascending: false }).limit(8),
      ])

      setStats({
        totalUsers: users.count ?? 0,
        totalTrips: trips.count ?? 0,
        pendingApprovals: pending.count ?? 0,
        approvedToday: approved.count ?? 0,
        activeCodes: codes.count ?? 0,
      })
      setRecentAudit(audit.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const statCards = [
    { label: 'Usuários cadastrados', value: stats.totalUsers, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', to: '/drivers' },
    { label: 'Total de viagens', value: stats.totalTrips, icon: Car, color: 'text-primary', bg: 'bg-primary/10 border-primary/20', to: '/trips' },
    { label: 'Aguardando aprovação', value: stats.pendingApprovals, icon: ClipboardCheck, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', to: '/approvals' },
    { label: 'Aprovadas hoje', value: stats.approvedToday, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', to: '/approvals' },
    { label: 'Códigos de acesso ativos', value: stats.activeCodes, icon: KeyRound, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', to: '/admin/access-codes' },
  ]

  const quickActions = [
    { label: 'Gerenciar Códigos', desc: 'Criar e controlar acessos', icon: KeyRound, to: '/admin/access-codes', color: 'text-purple-400' },
    { label: 'Aprovações', desc: 'Viagens aguardando revisão', icon: ClipboardCheck, to: '/approvals', color: 'text-amber-400' },
    { label: 'Motoristas', desc: 'Gerenciar usuários', icon: Users, to: '/drivers', color: 'text-blue-400' },
    { label: 'Relatórios', desc: 'Exportar e analisar dados', icon: BarChart3, to: '/reports', color: 'text-emerald-400' },
    { label: 'Auditoria', desc: 'Histórico completo', icon: Shield, to: '/audit', color: 'text-rose-400' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Admin"
        description="Visão geral do sistema Transmundim Logística"
      />

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link
              to={card.to}
              className={`block p-4 rounded-xl border bg-card hover:bg-card/80 transition-colors ${card.bg}`}
            >
              <div className={`p-2 rounded-lg inline-flex mb-3 ${card.bg}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              <div className={`text-2xl font-bold font-display ${loading ? 'text-muted-foreground' : card.color}`}>
                {loading ? '–' : card.value}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{card.label}</div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick actions */}
        <div className="glass-card p-5">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Acesso rápido
          </h3>
          <div className="space-y-2">
            {quickActions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors group"
              >
                <div className="p-2 rounded-lg bg-muted/40">
                  <action.icon className={`h-4 w-4 ${action.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent audit */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Auditoria recente
            </h3>
            <Link to="/audit" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Ver tudo →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : recentAudit.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhum evento registrado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentAudit.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{log.action}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
