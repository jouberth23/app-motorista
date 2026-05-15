import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Car,
  PlusCircle,
  Search,
  Filter,
  MapPin,
  Clock,
  Gauge,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/common/StatusBadge'
import { PageHeader } from '@/components/common/PageHeader'
import { TripCardSkeleton } from '@/components/common/LoadingSkeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { useTrips } from '@/hooks/useTrips'
import { useAuthContext } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { formatDate, formatTime } from '@/lib/utils'
import type { Trip } from '@/types/trip'
import type { TripStatus } from '@/types/enums'
import { TRIP_TYPE_LABELS } from '@/lib/constants'

function TripCard({ trip }: { trip: Trip }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Link
        to={`/trips/${trip.id}`}
        className="block glass-card p-5 hover:border-primary/30 transition-all group"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-semibold text-sm text-foreground">
                {trip.protocolo}
              </div>
              <div className="text-xs text-muted-foreground">
                {trip.placa} · {TRIP_TYPE_LABELS[trip.tipo_viagem]}
              </div>
            </div>
          </div>
          <StatusBadge status={trip.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span>{formatDate(trip.data)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{trip.base}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge className="h-3 w-3 flex-shrink-0" />
            <span>{trip.total_km ? `${trip.total_km} km` : '-'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span>{formatTime(trip.hora_inicial)} – {formatTime(trip.hora_final)}</span>
          </div>
        </div>

        {trip.setor && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {trip.setor}
            </span>
          </div>
        )}

        {trip.motivo_recusa && (
          <div className="mt-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400">
              <span className="font-medium">Recusado:</span> {trip.motivo_recusa}
            </p>
          </div>
        )}
      </Link>
    </motion.div>
  )
}

export function TripsPage() {
  const { user, role } = useAuthContext()
  const { isMotorista } = useRole(role)
  const { trips, loading } = useTrips(isMotorista ? user?.id : undefined)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TripStatus | 'all'>('all')

  const filtered = useMemo(() => {
    return trips.filter((t) => {
      const matchSearch =
        !search ||
        t.protocolo.toLowerCase().includes(search.toLowerCase()) ||
        t.placa.toLowerCase().includes(search.toLowerCase()) ||
        t.setor?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = statusFilter === 'all' || t.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [trips, search, statusFilter])

  return (
    <div className="space-y-6">
      <PageHeader
        title={isMotorista ? 'Minhas Viagens' : 'Todas as Viagens'}
        description={`${trips.length} viagem(ns) registrada(s)`}
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por protocolo, placa ou setor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as TripStatus | 'all')}
        >
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="enviado">Enviado</SelectItem>
            <SelectItem value="pendente">Em Análise</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="recusado">Recusado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Count */}
      {filtered.length !== trips.length && (
        <p className="text-xs text-muted-foreground">
          Mostrando {filtered.length} de {trips.length} viagens
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <TripCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Car}
          title="Nenhuma viagem encontrada"
          description={
            search || statusFilter !== 'all'
              ? 'Tente ajustar os filtros'
              : isMotorista
              ? 'Registre sua primeira viagem'
              : 'Nenhuma viagem registrada ainda'
          }
          action={
            isMotorista && !search ? (
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
        <div className="space-y-3">
          {filtered.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  )
}
