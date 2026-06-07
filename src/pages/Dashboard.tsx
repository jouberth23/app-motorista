import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Car,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  TrendingUp,
  DollarSign,
  AlertCircle,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { StatusBadge } from '@/components/common/StatusBadge'
import { DashboardSkeleton } from '@/components/common/LoadingSkeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { useAuthContext } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useTrips } from '@/hooks/useTrips'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Trip } from '@/types/trip'

interface StatTileProps {
  label: string
  value: string | number
  icon: React.ElementType
  color?: string
  trend?: string
}

function StatTile({ label, value, icon: Icon, color = 'text-primary', trend }: StatTileProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="label-text">{label}</span>
        <div className={cn('p-2 rounded-lg bg-current/10', color)}>
          <Icon className={cn('h-4 w-4', color)} />
        </div>
      </div>
      <div className="font-display text-2xl font-bold text-foreground">{value}</div>
      {trend && <div className="text-xs text-muted-foreground">{trend}</div>}
    </div>
  )
}

function TripRow({ trip }: { trip: Trip }) {
  return (
    <Link
      to={`/trips/${trip.id}`}
      className="flex items-center justify-between p-4 rounded-xl hover:bg-secondary/40 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Car className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{trip.protocolo}</div>
          <div className="text-xs text-muted-foreground">
            {trip.placa} · {formatDate(trip.data)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {trip.total_km && (
          <span className="hidden sm:block text-xs text-muted-foreground">{trip.total_km} km</span>
        )}
        <StatusBadge status={trip.status} />
      </div>
    </Link>
  )
}

const chartData = [
  { day: 'Seg', viagens: 3 },
  { day: 'Ter', viagens: 5 },
  { day: 'Qua', viagens: 2 },
  { day: 'Qui', viagens: 8 },
  { day: 'Sex', viagens: 6 },
  { day: 'Sáb', viagens: 1 },
  { day: 'Dom', viagens: 4 },
]

export function DashboardPage() {
  const { user, profile, role, loading: authLoading } = useAuthContext()
  const { isMotorista, isCentral } = useRole(role)
  const ready = !authLoading && !!user && !!role
  const { trips, loading: tripsLoading } = useTrips(isMotorista ? user?.id : undefined, { enabled: ready })
  const loading = !ready || tripsLoading

  const stats = useMemo(() => {
    const myTrips = trips

    return {
      total: myTrips.length,
      rascunho: myTrips.filter((t) => t.status === 'rascunho').length,
      enviado: myTrips.filter((t) => t.status === 'enviado').length,
      pendente: myTrips.filter((t) => t.status === 'pendente').length,
      aprovado: myTrips.filter((t) => t.status === 'aprovado').length,
      recusado: myTrips.filter((t) => t.status === 'recusado').length,
      totalKm: myTrips.reduce((s, t) => s + (t.total_km ?? 0), 0),
      totalGasto: myTrips
        .filter((t) => t.valor_total)
        .reduce((s, t) => s + (t.valor_total ?? 0), 0),
    }
  }, [trips])

  const recentTrips = useMemo(() => trips.slice(0, 5), [trips])
  const pendingApprovals = useMemo(
    () => trips.filter((t) => t.status === 'enviado' || t.status === 'pendente'),
    [trips],
  )

  if (loading) return <DashboardSkeleton />

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={`${greeting}, ${profile?.nome?.trim().split(' ')[0] || 'Usuário'}`}
        description="Aqui está um resumo das suas atividades"
        action={
          isMotorista ? (
            <Button asChild size="lg">
              <Link to="/trips/new">
                <PlusCircle className="h-4 w-4" />
                Nova Viagem
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Stats grid */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {isMotorista ? (
          <>
            <StatTile label="Total de Viagens" value={stats.total} icon={Car} />
            <StatTile label="Rascunhos" value={stats.rascunho} icon={FileText} color="text-zinc-400" />
            <StatTile label="Aprovadas" value={stats.aprovado} icon={CheckCircle2} color="text-emerald-400" />
            <StatTile label="Recusadas" value={stats.recusado} icon={XCircle} color="text-red-400" />
          </>
        ) : (
          <>
            <StatTile label="Viagens Hoje" value={stats.total} icon={Car} />
            <StatTile
              label="Aguardando"
              value={stats.enviado + stats.pendente}
              icon={Clock}
              color="text-amber-400"
              trend="Fila de aprovação"
            />
            <StatTile
              label="Total KM"
              value={`${stats.totalKm.toLocaleString('pt-BR')} km`}
              icon={TrendingUp}
              color="text-blue-400"
            />
            <StatTile
              label="Total Gasto"
              value={formatCurrency(stats.totalGasto)}
              icon={DollarSign}
              color="text-emerald-400"
            />
          </>
        )}
      </motion.div>

      {/* Main content */}
      <div className={cn('grid gap-6', isCentral ? 'lg:grid-cols-3' : '')}>
        {/* Chart - central only */}
        {isCentral && (
          <motion.div
            className="lg:col-span-2 glass-card p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <h3 className="section-title mb-4">Viagens nos últimos 7 dias</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorViagens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(213 94% 58%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(213 94% 58%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: 'hsl(210 15% 55%)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(210 15% 55%)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(222 20% 8%)',
                    border: '1px solid hsl(222 15% 16%)',
                    borderRadius: '8px',
                    color: 'hsl(210 20% 96%)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="viagens"
                  stroke="hsl(213 94% 58%)"
                  strokeWidth={2}
                  fill="url(#colorViagens)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Pending approvals - central */}
        {isCentral && (
          <motion.div
            className="glass-card p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Fila de Aprovação</h3>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                {pendingApprovals.length}
              </span>
            </div>
            {pendingApprovals.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Tudo aprovado"
                description="Nenhuma viagem aguardando revisão"
              />
            ) : (
              <div className="space-y-2">
                {pendingApprovals.slice(0, 4).map((trip) => (
                  <Link
                    key={trip.id}
                    to={`/trips/${trip.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/40 transition-colors"
                  >
                    <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{trip.protocolo}</div>
                      <div className="text-[10px] text-muted-foreground">{trip.driver_name ?? 'Motorista'}</div>
                    </div>
                    <StatusBadge status={trip.status} />
                  </Link>
                ))}
                {pendingApprovals.length > 4 && (
                  <Link to="/approvals" className="text-xs text-primary hover:underline block text-center pt-1">
                    Ver todas ({pendingApprovals.length})
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Recent trips */}
        <motion.div
          className={cn('glass-card', isCentral ? 'lg:col-span-3' : '')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between p-6 pb-2">
            <h3 className="section-title">
              {isMotorista ? 'Minhas Últimas Viagens' : 'Viagens Recentes'}
            </h3>
            <Link to="/trips" className="text-xs text-primary hover:underline">
              Ver todas
            </Link>
          </div>

          {recentTrips.length === 0 ? (
            <EmptyState
              icon={Car}
              title="Nenhuma viagem ainda"
              description={
                isMotorista
                  ? 'Crie sua primeira viagem clicando em Nova Viagem'
                  : 'Nenhuma viagem registrada ainda'
              }
              action={
                isMotorista ? (
                  <Button asChild>
                    <Link to="/trips/new">
                      <PlusCircle className="h-4 w-4" />
                      Nova Viagem
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="px-3 pb-4">
              {recentTrips.map((trip) => (
                <TripRow key={trip.id} trip={trip} />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
