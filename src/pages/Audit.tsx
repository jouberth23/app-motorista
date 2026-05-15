import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Shield, Search, Download, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, FileText, Pencil,
  Trash2, LogIn, Send, FilePlus2, ArrowRight,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { formatDateTime, formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { AuditLog } from '@/types/trip'

// ── Maps ──────────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  INSERT: 'Criado',
  UPDATE: 'Atualizado',
  DELETE: 'Excluído',
  SEND: 'Enviado para central',
  APPROVE: 'Aprovado',
  REJECT: 'Recusado',
  CORRECAO_SOLICITADA: 'Correção solicitada',
  PDF_GERADO: 'PDF gerado',
  VALOR_DEFINIDO: 'Valor definido',
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  SIGNUP: 'Cadastro',
}

const ENTITY_LABELS: Record<string, string> = {
  trips: 'Viagem',
  passengers: 'Passageiro',
  photos: 'Foto',
  signatures: 'Assinatura',
  approvals: 'Aprovação',
  profiles: 'Perfil',
  access_codes: 'Código de acesso',
  audit_logs: 'Auditoria',
}

interface ActionStyle { color: string; bg: string; icon: React.ElementType }

const ACTION_STYLES: Record<string, ActionStyle> = {
  INSERT:              { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: FilePlus2 },
  UPDATE:              { color: 'text-blue-400',    bg: 'bg-blue-500/10',    icon: Pencil },
  DELETE:              { color: 'text-red-400',     bg: 'bg-red-500/10',     icon: Trash2 },
  SEND:                { color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: Send },
  APPROVE:             { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  REJECT:              { color: 'text-red-400',     bg: 'bg-red-500/10',     icon: XCircle },
  CORRECAO_SOLICITADA: { color: 'text-orange-400',  bg: 'bg-orange-500/10',  icon: AlertTriangle },
  PDF_GERADO:          { color: 'text-purple-400',  bg: 'bg-purple-500/10',  icon: FileText },
  VALOR_DEFINIDO:      { color: 'text-blue-400',    bg: 'bg-blue-500/10',    icon: Pencil },
  LOGIN:               { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: LogIn },
}

const DEFAULT_STYLE: ActionStyle = { color: 'text-muted-foreground', bg: 'bg-muted/30', icon: Shield }

// Human-readable labels for trip record fields
const TRIP_FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  valor_total: 'Valor total',
  motivo_recusa: 'Motivo da recusa',
  motivo_correcao: 'Correção solicitada',
  placa: 'Placa',
  base: 'Base',
  setor: 'Setor',
  protocolo: 'Protocolo',
  pdf_path: 'PDF',
  driver_name: 'Motorista',
  hora_inicial: 'Hora inicial',
  hora_final: 'Hora final',
  km_inicial: 'KM inicial',
  km_final: 'KM final',
  total_km: 'Total KM',
  tipo_viagem: 'Tipo de viagem',
  sent_at: 'Enviado em',
  approved_at: 'Aprovado em',
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado para central',
  pendente: 'Em Análise',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  correcao: 'Correção Solicitada',
}

// Fields to show in INSERT summaries (subset)
const INSERT_SUMMARY_FIELDS = ['protocolo', 'status', 'placa', 'base', 'setor', 'driver_name']

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'status') return STATUS_LABELS[String(value)] ?? String(value)
  if (key === 'valor_total') return formatCurrency(Number(value))
  if (key === 'pdf_path') return 'Arquivo salvo ✓'
  if (key === 'total_km' || key === 'km_inicial' || key === 'km_final') return `${value} km`
  const str = String(value)
  // Detect ISO datetime strings
  if (str.length > 16 && str.includes('T') && str.includes(':')) {
    try { return formatDateTime(str) } catch { /* noop */ }
  }
  return str
}

// ── Diff renderer (replaces raw JSON) ────────────────────────────────────────

function DiffView({
  diff,
  entity,
  entityId,
}: {
  diff: Record<string, unknown>
  entity: string
  entityId?: string
}) {
  const isTriggeredFormat = 'new' in diff || 'old' in diff

  let rows: { label: string; from?: string; to: string }[] = []

  if (isTriggeredFormat) {
    const newRec = (diff.new ?? {}) as Record<string, unknown>
    const oldRec = (diff.old ?? null) as Record<string, unknown> | null

    if (!oldRec) {
      // INSERT — show summary fields
      rows = INSERT_SUMMARY_FIELDS
        .filter((k) => newRec[k] != null && newRec[k] !== '')
        .map((k) => ({ label: TRIP_FIELD_LABELS[k] ?? k, to: formatFieldValue(k, newRec[k]) }))
    } else {
      // UPDATE — show only changed relevant fields
      rows = Object.entries(newRec)
        .filter(([k, v]) => {
          if (['updated_at', 'created_at', 'id', 'driver_id', 'approved_by', 'valor_definido_por'].includes(k)) return false
          if (!(k in TRIP_FIELD_LABELS)) return false
          return oldRec[k] !== v
        })
        .map(([k, v]) => ({
          label: TRIP_FIELD_LABELS[k] ?? k,
          from: oldRec[k] != null && oldRec[k] !== '' ? formatFieldValue(k, oldRec[k]) : undefined,
          to: formatFieldValue(k, v),
        }))
    }
  } else {
    // Our custom logAudit format: flat {key: value}
    rows = Object.entries(diff)
      .filter(([k]) => k !== 'protocolo')
      .map(([k, v]) => ({ label: TRIP_FIELD_LABELS[k] ?? k, to: formatFieldValue(k, v) }))
  }

  const tripLink = entity === 'trips' && entityId

  if (rows.length === 0 && !tripLink) return null

  return (
    <div className="mt-1.5 space-y-1">
      {rows.map(({ label, from, to }) => (
        <div key={label} className="flex items-baseline gap-1 text-[10px] flex-wrap">
          <span className="text-muted-foreground/60 flex-shrink-0">{label}:</span>
          {from && (
            <>
              <span className="text-muted-foreground/40 line-through">{from}</span>
              <span className="text-muted-foreground/50">→</span>
            </>
          )}
          <span className="text-muted-foreground font-medium">{to}</span>
        </div>
      ))}
      {tripLink && (
        <Link
          to={`/trips/${entityId}`}
          className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors font-medium"
        >
          <FileText className="h-3 w-3" />
          Ver viagem / PDF
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}

// ── Log entry row ─────────────────────────────────────────────────────────────

function LogEntry({ log, index }: { log: AuditLog; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const style = ACTION_STYLES[log.action] ?? DEFAULT_STYLE
  const Icon = style.icon

  const hasDiff = log.diff && Object.keys(log.diff).length > 0
  const isTripEntity = log.entity === 'trips' && !!log.entity_id

  // For trigger-format diffs, always show the link inline (no expand needed)
  const isTriggeredFormat = hasDiff && ('new' in (log.diff ?? {}) || 'old' in (log.diff ?? {}))

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      className="flex items-start gap-4 px-5 py-3.5 hover:bg-muted/10 transition-colors"
    >
      {/* Action icon */}
      <div className={cn('mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', style.bg)}>
        <Icon className={cn('h-3.5 w-3.5', style.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-bold', style.color)}>
            {ACTION_LABELS[log.action] ?? log.action}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs font-medium text-foreground">
            {ENTITY_LABELS[log.entity] ?? log.entity}
          </span>
          {log.entity_id && (
            <code className="text-[10px] text-muted-foreground/50 font-mono">
              #{log.entity_id.slice(0, 8)}
            </code>
          )}
        </div>

        {log.user_name && (
          <p className="text-xs text-muted-foreground mt-0.5">por {log.user_name}</p>
        )}

        {/* Trigger-format: show inline diff + trip link (no expand button) */}
        {isTriggeredFormat && (
          <DiffView
            diff={log.diff!}
            entity={log.entity}
            entityId={log.entity_id}
          />
        )}

        {/* Custom logAudit format: collapsible details */}
        {hasDiff && !isTriggeredFormat && (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Detalhes
            </button>
            {expanded && (
              <DiffView
                diff={log.diff!}
                entity={log.entity}
                entityId={log.entity_id}
              />
            )}
          </>
        )}

        {/* If no diff but it's a trip entity, still show the link */}
        {!hasDiff && isTripEntity && (
          <Link
            to={`/trips/${log.entity_id}`}
            className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary hover:text-primary/80 transition-colors font-medium"
          >
            <FileText className="h-3 w-3" />
            Ver viagem / PDF
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Date */}
      <div className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
        {formatDateTime(log.created_at)}
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AuditPage() {
  const { role } = useAuthContext()
  const { isAdmin } = useRole(role)

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchLogs = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (!isAdmin) {
        query = query.in('entity', ['trips', 'approvals'])
      }
      if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00.000Z')
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z')

      const { data } = await query
      setLogs((data as AuditLog[]) ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [isAdmin, dateFrom, dateTo])

  const filtered = useMemo(() => {
    if (!search.trim()) return logs
    const q = search.toLowerCase()
    return logs.filter(
      (l) =>
        (ACTION_LABELS[l.action] ?? l.action).toLowerCase().includes(q) ||
        (ENTITY_LABELS[l.entity] ?? l.entity).toLowerCase().includes(q) ||
        (l.user_name ?? '').toLowerCase().includes(q) ||
        (l.entity_id ?? '').toLowerCase().includes(q),
    )
  }, [logs, search])

  const exportCSV = () => {
    const headers = ['Data/Hora', 'Ação', 'Entidade', 'ID', 'Usuário']
    const rows = filtered.map((l) => [
      formatDateTime(l.created_at),
      ACTION_LABELS[l.action] ?? l.action,
      ENTITY_LABELS[l.entity] ?? l.entity,
      l.entity_id?.slice(0, 8) ?? '',
      l.user_name ?? l.by_user ?? '',
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAdmin ? 'Auditoria Completa' : 'Log de Auditoria'}
        description={
          isAdmin
            ? 'Todos os eventos do sistema em tempo real'
            : 'Histórico das operações de viagens'
        }
        action={
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ação, entidade ou usuário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">De</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            max={dateTo || undefined}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Até</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom || undefined}
          />
        </div>
      </div>

      {!loading && (
        <p className="text-xs text-muted-foreground px-1">
          {filtered.length} evento{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-10 flex flex-col items-center gap-3 text-muted-foreground">
            <Shield className="h-8 w-8 animate-pulse" />
            <p className="text-sm">Carregando logs...</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Shield} title="Nenhum evento encontrado" description="Tente ajustar os filtros de busca" />
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map((log, i) => (
              <LogEntry key={log.id} log={log} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
