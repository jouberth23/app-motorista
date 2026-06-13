import { useState, useMemo, useEffect } from 'react'
import {
  BarChart3,
  Download,
  Search,
  Filter,
  DollarSign,
  Gauge,
  Car,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/common/StatusBadge'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { useTrips } from '@/hooks/useTrips'
import { useAuthContext } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, formatVoucherLabel } from '@/lib/utils'
import type { TripStatus } from '@/types/enums'
import type { TripExpense } from '@/types/trip'
import { Link } from 'react-router-dom'

type PeriodType = 'semanal' | 'mensal' | 'decendio'

const PERIOD_LABELS: Record<PeriodType, string> = {
  semanal: 'Semanal',
  mensal: 'Mensal',
  decendio: 'Decêndio',
}

const MES_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// Blocos fixos dentro do mês (não são semanas ISO)
function getMonthBlocks(year: number, month: number, type: PeriodType): { start: number; end: number }[] {
  const lastDay = new Date(year, month + 1, 0).getDate()
  if (type === 'mensal') return [{ start: 1, end: lastDay }]
  if (type === 'semanal') {
    return [
      { start: 1, end: 7 },
      { start: 8, end: 14 },
      { start: 15, end: 21 },
      { start: 22, end: lastDay },
    ]
  }
  return [
    { start: 1, end: 10 },
    { start: 11, end: 20 },
    { start: 21, end: lastDay },
  ]
}

export function ReportsPage() {
  const { user, role, loading: authLoading } = useAuthContext()
  const { isCentral } = useRole(role)
  const ready = !authLoading && !!user && !!role
  const { trips, loading: tripsLoading } = useTrips(undefined, { enabled: ready })
  const loading = !ready || tripsLoading
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TripStatus | 'all'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const PER_PAGE = 15

  // Resumo por período (Semanal/Mensal/Decêndio)
  const [periodType, setPeriodType] = useState<PeriodType>('semanal')
  const [anchorYear, setAnchorYear] = useState(() => new Date().getFullYear())
  const [anchorMonth, setAnchorMonth] = useState(() => new Date().getMonth())
  const [blockIndex, setBlockIndex] = useState(0)

  // Despesas
  const [expenses, setExpenses] = useState<TripExpense[]>([])

  useEffect(() => {
    if (!ready) return
    supabase
      .from('trip_expenses')
      .select('*')
      .then(({ data }) => setExpenses((data as TripExpense[]) ?? []))
  }, [ready])

  const filtered = useMemo(() => {
    return trips.filter((t) => {
      const matchSearch =
        !search ||
        t.protocolo.toLowerCase().includes(search.toLowerCase()) ||
        t.placa.toLowerCase().includes(search.toLowerCase()) ||
        (t.setor ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.driver_name ?? '').toLowerCase().includes(search.toLowerCase())

      const matchStatus = statusFilter === 'all' || t.status === statusFilter

      const matchDateFrom = !dateFrom || t.data >= dateFrom
      const matchDateTo = !dateTo || t.data <= dateTo

      return matchSearch && matchStatus && matchDateFrom && matchDateTo
    })
  }, [trips, search, statusFilter, dateFrom, dateTo])

  const totals = useMemo(() => ({
    total: filtered.length,
    totalKm: filtered.reduce((s, t) => s + (t.total_km ?? 0), 0),
    totalGasto: filtered.filter((t) => t.valor_total).reduce((s, t) => s + (t.valor_total ?? 0), 0),
    mediaValor: filtered.filter((t) => t.valor_total).length > 0
      ? filtered.filter((t) => t.valor_total).reduce((s, t) => s + (t.valor_total ?? 0), 0) /
        filtered.filter((t) => t.valor_total).length
      : 0,
    aprovadas: filtered.filter((t) => t.status === 'aprovado').length,
    recusadas: filtered.filter((t) => t.status === 'recusado').length,
  }), [filtered])

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  // ── Resumo por período ──────────────────────────────────────────────────
  const blocks = useMemo(
    () => getMonthBlocks(anchorYear, anchorMonth, periodType),
    [anchorYear, anchorMonth, periodType],
  )

  const handlePeriodTypeChange = (type: PeriodType) => {
    setPeriodType(type)
    setBlockIndex(0)
  }

  const goPrev = () => {
    if (periodType === 'mensal') {
      if (anchorMonth === 0) { setAnchorYear((y) => y - 1); setAnchorMonth(11) } else setAnchorMonth((m) => m - 1)
      return
    }
    if (blockIndex === 0) {
      let m = anchorMonth - 1
      let y = anchorYear
      if (m < 0) { m = 11; y -= 1 }
      setAnchorYear(y)
      setAnchorMonth(m)
      setBlockIndex(getMonthBlocks(y, m, periodType).length - 1)
    } else {
      setBlockIndex((i) => i - 1)
    }
  }

  const goNext = () => {
    if (periodType === 'mensal') {
      if (anchorMonth === 11) { setAnchorYear((y) => y + 1); setAnchorMonth(0) } else setAnchorMonth((m) => m + 1)
      return
    }
    if (blockIndex === blocks.length - 1) {
      let m = anchorMonth + 1
      let y = anchorYear
      if (m > 11) { m = 0; y += 1 }
      setAnchorYear(y)
      setAnchorMonth(m)
      setBlockIndex(0)
    } else {
      setBlockIndex((i) => i + 1)
    }
  }

  const periodSummary = useMemo(() => {
    const block = blocks[Math.min(blockIndex, blocks.length - 1)]
    const pad = (n: number) => String(n).padStart(2, '0')
    const startStr = `${anchorYear}-${pad(anchorMonth + 1)}-${pad(block.start)}`
    const endStr = `${anchorYear}-${pad(anchorMonth + 1)}-${pad(block.end)}`
    const inRange = trips.filter((t) => t.data >= startStr && t.data <= endStr)
    const total = inRange.reduce((sum, t) => sum + (t.valor_total || 0), 0)
    return {
      label: periodType === 'mensal'
        ? `${MES_NOMES[anchorMonth]} ${anchorYear}`
        : `${pad(block.start)}-${pad(block.end)}/${pad(anchorMonth + 1)}/${anchorYear}`,
      quantidade: inRange.length,
      total,
      media: inRange.length > 0 ? total / inRange.length : 0,
    }
  }, [trips, blocks, blockIndex, anchorYear, anchorMonth, periodType])

  // ── Despesas ─────────────────────────────────────────────────────────────
  const tripsById = useMemo(() => {
    const map = new Map<string, (typeof trips)[number]>()
    for (const t of trips) map.set(t.id, t)
    return map
  }, [trips])

  const expensesFiltered = useMemo(() => {
    return expenses.filter((e) => {
      const trip = tripsById.get(e.trip_id)
      if (!trip) return false
      const matchDateFrom = !dateFrom || trip.data >= dateFrom
      const matchDateTo = !dateTo || trip.data <= dateTo
      return matchDateFrom && matchDateTo
    })
  }, [expenses, tripsById, dateFrom, dateTo])

  const expensesTotal = useMemo(
    () => expensesFiltered.reduce((sum, e) => sum + e.valor, 0),
    [expensesFiltered],
  )

  const expensesByMotorista = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; count: number }>()
    for (const e of expensesFiltered) {
      const trip = tripsById.get(e.trip_id)
      const cur = map.get(e.driver_id) ?? { nome: trip?.driver_name ?? '—', total: 0, count: 0 }
      cur.total += e.valor
      cur.count += 1
      map.set(e.driver_id, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [expensesFiltered, tripsById])

  const exportCSV = () => {
    const headers = ['Voucher #', 'Protocolo', 'Data', 'Motorista', 'Placa', 'Base', 'Setor', 'Status', 'KM', 'Valor']
    const rows = filtered.map((t) => [
      t.numero_sequencial ?? '',
      t.protocolo,
      t.data,
      t.driver_name ?? '',
      t.placa,
      t.base,
      t.setor,
      t.status,
      t.total_km ?? '',
      t.valor_total ?? '',
    ])
    const csv = [headers, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transmundim-logistica-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Análise e exportação de viagens"
        action={
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        }
      />

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Viagens', value: totals.total, icon: Car },
          { label: 'Total KM', value: `${totals.totalKm.toLocaleString('pt-BR')} km`, icon: Gauge },
          { label: 'Total Gasto', value: formatCurrency(totals.totalGasto), icon: DollarSign },
          { label: 'Média por Viagem', value: formatCurrency(totals.mediaValor), icon: BarChart3 },
          { label: 'Aprovadas', value: totals.aprovadas, icon: CheckCircle2 },
          { label: 'Recusadas', value: totals.recusadas, icon: XCircle },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
            </div>
            <div className="font-display font-bold text-base text-foreground">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          Filtros
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as TripStatus | 'all'); setPage(1) }}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="pendente">Em Análise</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="recusado">Recusado</SelectItem>
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <Label className="text-xs">Data Inicial</Label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data Final</Label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} />
          </div>
        </div>
      </div>

      {/* Resumo por período */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Resumo por Período
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1.5">
              {(['semanal', 'mensal', 'decendio'] as PeriodType[]).map((type) => (
                <Button
                  key={type}
                  variant={periodType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePeriodTypeChange(type)}
                >
                  {PERIOD_LABELS[type]}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon-sm" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium text-muted-foreground px-1 whitespace-nowrap">
                {periodSummary.label}
              </span>
              <Button variant="outline" size="icon-sm" onClick={goNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card p-4">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Quantidade</span>
            <div className="font-display font-bold text-base text-foreground mt-1">{periodSummary.quantidade}</div>
          </div>
          <div className="glass-card p-4">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor Total</span>
            <div className="font-display font-bold text-base text-foreground mt-1">{formatCurrency(periodSummary.total)}</div>
          </div>
          <div className="glass-card p-4">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor Médio</span>
            <div className="font-display font-bold text-base text-foreground mt-1">{formatCurrency(periodSummary.media)}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/20 flex items-center justify-between">
          <span className="text-sm font-medium">
            {filtered.length} resultado(s)
          </span>
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages || 1}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={BarChart3} title="Nenhum resultado" description="Ajuste os filtros para encontrar viagens" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Protocolo', 'Data', 'Placa', 'Base', 'Setor', 'KM', 'Valor', 'Status'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginated.map((trip) => (
                    <tr key={trip.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/trips/${trip.id}`} className="text-primary hover:underline font-mono text-xs">
                          {formatVoucherLabel(trip)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(trip.data)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{trip.placa}</td>
                      <td className="px-4 py-3 text-muted-foreground">{trip.base}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {trip.setor}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{trip.total_km ? `${trip.total_km}` : '-'}</td>
                      <td className="px-4 py-3">
                        {trip.valor_total ? (
                          <span className="text-emerald-400 font-medium">{formatCurrency(trip.valor_total)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Pendente</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={trip.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Próxima
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Despesas */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/20 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{isCentral ? 'Despesas' : 'Minhas Despesas'}</h3>
        </div>

        {expensesFiltered.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhuma despesa" description="Nenhuma despesa registrada no período selecionado" />
        ) : (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-4">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total de Despesas</span>
                <div className="font-display font-bold text-base text-foreground mt-1">{formatCurrency(expensesTotal)}</div>
              </div>
              <div className="glass-card p-4">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Quantidade</span>
                <div className="font-display font-bold text-base text-foreground mt-1">{expensesFiltered.length}</div>
              </div>
            </div>

            {isCentral && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Motorista', 'Qtd', 'Total (Reembolso)'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {expensesByMotorista.map((m, i) => (
                      <tr key={i} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">{m.nome}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{m.count}</td>
                        <td className="px-4 py-2.5 text-emerald-400 font-medium">{formatCurrency(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
