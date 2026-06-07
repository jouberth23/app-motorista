import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardCheck, Car, Clock, AlertCircle, CheckCircle2, XCircle,
  ChevronRight, Gauge, AlertTriangle, Loader2, ChevronDown,
  DollarSign, FileText, RefreshCw,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatusBadge } from '@/components/common/StatusBadge'
import { TripCardSkeleton } from '@/components/common/LoadingSkeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTrips, useTripActions } from '@/hooks/useTrips'
import { useAuthContext } from '@/contexts/AuthContext'
import { generateTripPDFBlob, saveTripPDF } from '@/services/pdf'
import { formatDate, formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Trip } from '@/types/trip'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'

// ── Queue card (fila) ─────────────────────────────────────────────────────────

type ActionMode = 'idle' | 'rejecting' | 'correcting'

function QueueCard({ trip, onProcessed }: { trip: Trip; onProcessed: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuthContext()
  const { approveTrip, rejectTrip, requestCorrection } = useTripActions()

  const [expanded, setExpanded] = useState(false)
  const [valor, setValor] = useState('')
  const [mode, setMode] = useState<ActionMode>('idle')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)

  const switchMode = (next: ActionMode) => {
    setMode((prev) => (prev === next ? 'idle' : next))
    setMotivo('')
  }

  const handleApprove = async () => {
    const v = parseFloat(valor)
    if (!v || v <= 0) { toast.error('Informe o valor total'); return }
    setLoading(true)
    try {
      await approveTrip(trip.id, v, user!.id)
      // Navigate to TripDetails — it will auto-generate the full PDF (with photos/sigs)
      navigate(`/trips/${trip.id}`, { state: { autoGeneratePDF: true } })
    } catch {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (motivo.trim().length < 10) { toast.error('Mínimo 10 caracteres'); return }
    setLoading(true)
    try {
      await rejectTrip(trip.id, motivo, user!.id)
      // Generate text-only PDF immediately (no photo/sig URLs available in queue)
      try {
        const blob = await generateTripPDFBlob(trip, {}, {})
        await saveTripPDF(trip.id, trip.protocolo, blob)
        toast.success('Viagem recusada · PDF salvo automaticamente')
      } catch {
        toast.success('Viagem recusada')
        toast.warning('PDF não pôde ser salvo automaticamente — gere na tela da viagem')
      }
      onProcessed()
    } catch {
      setLoading(false)
    }
  }

  const handleCorrection = async () => {
    if (motivo.trim().length < 10) { toast.error('Mínimo 10 caracteres'); return }
    setLoading(true)
    try {
      await requestCorrection(trip.id, motivo, user!.id)
      onProcessed()
    } catch {
      setLoading(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="glass-card overflow-hidden"
    >
      {/* Summary row */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0 animate-pulse">
          <AlertCircle className="h-5 w-5 text-amber-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-display font-semibold text-sm">{trip.protocolo}</span>
            <StatusBadge status={trip.status} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Car className="h-3 w-3" />{trip.driver_name ?? 'Motorista'}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(trip.data)}</span>
            <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{trip.total_km ? `${trip.total_km} km` : '-'}</span>
            <span className="truncate">{trip.base}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button asChild variant="ghost" size="sm" className="hidden sm:flex">
            <Link to={`/trips/${trip.id}`}>
              <FileText className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="sm"
            variant={expanded ? 'default' : 'outline'}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Fechar' : 'Analisar'}
            <ChevronDown className={cn('h-4 w-4 ml-1 transition-transform', expanded && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {/* Action panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50 p-4 bg-muted/10 space-y-4">
              {/* Valor input */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <DollarSign className="h-3.5 w-3.5 text-primary" />
                  Valor Total (R$) — obrigatório para aprovar
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="max-w-[180px]"
                  disabled={loading}
                />
                {valor && parseFloat(valor) > 0 && (
                  <p className="text-xs text-emerald-400">{formatCurrency(parseFloat(valor))}</p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="success"
                  size="sm"
                  onClick={handleApprove}
                  disabled={loading || !valor || parseFloat(valor) <= 0}
                >
                  {loading && mode === 'idle'
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <CheckCircle2 className="h-4 w-4" />}
                  Aprovar
                </Button>
                <Button
                  variant={mode === 'correcting' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => switchMode('correcting')}
                  disabled={loading}
                  className={mode === 'correcting' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                >
                  <AlertTriangle className={cn('h-4 w-4', mode !== 'correcting' && 'text-orange-400')} />
                  Correção
                </Button>
                <Button
                  variant={mode === 'rejecting' ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => switchMode('rejecting')}
                  disabled={loading}
                >
                  <XCircle className="h-4 w-4" />
                  Recusar
                </Button>
              </div>

              {/* Motivo panel */}
              <AnimatePresence>
                {mode !== 'idle' && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className={cn(
                      'rounded-xl p-3 space-y-3 border',
                      mode === 'rejecting'
                        ? 'bg-red-500/5 border-red-500/20'
                        : 'bg-orange-500/5 border-orange-500/20',
                    )}
                  >
                    <Label className="text-xs">
                      {mode === 'rejecting' ? 'Motivo da recusa *' : 'O que precisa ser corrigido? *'}
                    </Label>
                    <Textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder={
                        mode === 'rejecting'
                          ? 'Descreva o motivo (mín. 10 caracteres)...'
                          : 'Ex: Foto do odômetro está ilegível...'
                      }
                      rows={3}
                      className="resize-none text-sm"
                      disabled={loading}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{motivo.trim().length} / mín. 10</span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => switchMode('idle')}
                          disabled={loading}
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant={mode === 'rejecting' ? 'destructive' : 'default'}
                          size="sm"
                          onClick={mode === 'rejecting' ? handleReject : handleCorrection}
                          disabled={loading || motivo.trim().length < 10}
                          className={mode === 'correcting' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                        >
                          {loading
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : mode === 'rejecting'
                            ? <XCircle className="h-4 w-4" />
                            : <AlertTriangle className="h-4 w-4" />}
                          Confirmar
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Regular approval card (non-fila tabs) ─────────────────────────────────────

function ApprovalCard({ trip }: { trip: Trip }) {
  const isPending = trip.status === 'enviado' || trip.status === 'pendente'

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Link
        to={`/trips/${trip.id}`}
        className="block glass-card p-5 hover:border-primary/30 transition-all group"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {isPending ? (
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-400" />
              </div>
            ) : (
              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  trip.status === 'aprovado'
                    ? 'bg-emerald-500/15 border border-emerald-500/30'
                    : 'bg-red-500/15 border border-red-500/30',
                )}
              >
                {trip.status === 'aprovado'
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  : <XCircle className="h-5 w-5 text-red-400" />}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-display font-semibold text-sm">{trip.protocolo}</div>
              <div className="text-xs text-muted-foreground">
                {trip.driver_name ?? 'Motorista'} · {trip.placa}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={trip.status} />
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />{formatDate(trip.data)}
          </div>
          <div className="flex items-center gap-1.5">
            <Car className="h-3 w-3" />{trip.base}
          </div>
          <div className="flex items-center gap-1.5">
            <Gauge className="h-3 w-3" />{trip.total_km ? `${trip.total_km} km` : '-'}
          </div>
        </div>

        {trip.valor_total && (
          <div className="mt-2 text-sm font-bold text-emerald-400">
            {formatCurrency(trip.valor_total)}
          </div>
        )}
        {trip.setor && (
          <div className="mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {trip.setor}
            </span>
          </div>
        )}
      </Link>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ApprovalsPage() {
  const { user, role, loading: authLoading } = useAuthContext()
  const ready = !authLoading && !!user && !!role
  const { trips, loading: tripsLoading, refetch } = useTrips(undefined, { enabled: ready })
  const loading = !ready || tripsLoading
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const grouped = useMemo(
    () => ({
      fila: trips.filter((t) => t.status === 'enviado'),
      pending: trips.filter((t) => t.status === 'enviado' || t.status === 'pendente'),
      approved: trips.filter((t) => t.status === 'aprovado'),
      rejected: trips.filter((t) => t.status === 'recusado'),
      all: trips,
    }),
    [trips],
  )

  const TabCount = ({ count }: { count: number }) =>
    count > 0 ? (
      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-current/15">
        {count}
      </span>
    ) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <PageHeader
          title="Central de Aprovações"
          description="Revisar e aprovar viagens enviadas pelos motoristas"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex-shrink-0"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-display font-bold text-amber-400">{grouped.fila.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Na fila</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-display font-bold text-emerald-400">{grouped.approved.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Aprovadas</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-display font-bold text-red-400">{grouped.rejected.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Recusadas</div>
        </div>
      </div>

      <Tabs defaultValue="fila">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="fila" className="flex-1 sm:flex-none">
            Fila
            {grouped.fila.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-400">
                {grouped.fila.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex-1 sm:flex-none">
            Pendentes
            <TabCount count={grouped.pending.length} />
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex-1 sm:flex-none">
            Aprovadas
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex-1 sm:flex-none">
            Recusadas
          </TabsTrigger>
          <TabsTrigger value="all" className="hidden sm:flex">
            Todas
          </TabsTrigger>
        </TabsList>

        {/* Fila tab — inline actions */}
        <TabsContent value="fila" className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <TripCardSkeleton key={i} />)}
            </div>
          ) : grouped.fila.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Fila vazia"
              description="Nenhuma viagem aguardando análise no momento"
            />
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="space-y-3">
                {grouped.fila.map((trip) => (
                  <QueueCard key={trip.id} trip={trip} onProcessed={refetch} />
                ))}
              </div>
            </AnimatePresence>
          )}
        </TabsContent>

        {/* Remaining tabs — link cards */}
        {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <TripCardSkeleton key={i} />)}
              </div>
            ) : grouped[tab].length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title={
                  tab === 'pending' ? 'Nenhuma viagem pendente'
                  : tab === 'approved' ? 'Nenhuma viagem aprovada'
                  : tab === 'rejected' ? 'Nenhuma viagem recusada'
                  : 'Nenhuma viagem'
                }
                description={tab === 'pending' ? 'Quando motoristas enviarem viagens, elas aparecerão aqui' : undefined}
              />
            ) : (
              <div className="space-y-3">
                {grouped[tab].map((trip) => (
                  <ApprovalCard key={trip.id} trip={trip} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
