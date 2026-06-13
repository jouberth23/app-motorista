import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Car, Clock, MapPin, User, Camera, PenLine, Lock,
  CheckCircle2, XCircle, AlertTriangle, FileText, DollarSign,
  Loader2, Download, Send, FileCheck2, History,
  FilePlus2, Pencil, MessageCircle, Plus, Trash2, Receipt,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/common/StatusBadge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useAuthContext } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useTripActions } from '@/hooks/useTrips'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { logAudit } from '@/lib/audit'
import { supabase } from '@/lib/supabase'
import { formatDate, formatTime, formatCurrency, formatDateTime, formatVoucherLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Trip, AuditLog, TripExpense } from '@/types/trip'
import type { TripType } from '@/types/enums'
import { SETORES } from '@/types/enums'
import { TRIP_TYPE_LABELS } from '@/lib/constants'
import { generateTripPDF, saveTripPDF } from '@/services/pdf'
import { SendWhatsappDialog } from '@/components/trips/SendWhatsappDialog'
import { toast } from 'sonner'

// ── Action label map (shared with Audit page) ─────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  SEND: 'Enviado para central',
  APPROVE: 'Aprovado',
  REJECT: 'Recusado',
  CORRECAO_SOLICITADA: 'Correção solicitada',
  CORRECAO_ENVIADA: 'Correção enviada',
  CORRECAO_CENTRAL: 'Correção pela central',
  PDF_GERADO: 'PDF gerado',
  WHATSAPP_SENT: 'PDF enviado por WhatsApp',
  INSERT: 'Criado',
  UPDATE: 'Atualizado',
}

interface EditFormState {
  data: string
  placa: string
  base: string
  tipo_viagem: string
  hora_inicial: string
  hora_final: string
  hora_parada: string
  km_inicial: string
  km_final: string
  inicio_base: string
  final_base: string
  embarque_empregado: string
  desembarque_empregado: string
  justificativa: string
  setor: string
  passengers: { nome: string; matricula: string }[]
  photoFiles: Record<string, { file: File; previewUrl: string } | null>
}

function initEditForm(trip: Trip): EditFormState {
  return {
    data: trip.data,
    placa: trip.placa,
    base: trip.base,
    tipo_viagem: trip.tipo_viagem,
    hora_inicial: trip.hora_inicial,
    hora_final: trip.hora_final,
    hora_parada: trip.hora_parada ?? '',
    km_inicial: trip.km_inicial?.toString() ?? '',
    km_final: trip.km_final?.toString() ?? '',
    inicio_base: trip.inicio_base,
    final_base: trip.final_base,
    embarque_empregado: trip.embarque_empregado,
    desembarque_empregado: trip.desembarque_empregado,
    justificativa: trip.justificativa,
    setor: trip.setor,
    passengers: trip.passengers?.map((p) => ({ nome: p.nome, matricula: p.matricula ?? '' })) ?? [],
    photoFiles: {},
  }
}

interface TimelineEvent {
  id: string
  date: string
  action: string
  user?: string
  detail?: string
  synthetic?: boolean
}

const SKIP_DIFF_KEYS = new Set(['protocolo', 'id', 'driver_id', 'created_at', 'updated_at', 'old', 'new'])

function buildDiffDetail(diff: Record<string, unknown> | undefined | null): string {
  if (!diff) return ''
  return Object.entries(diff)
    .filter(([k, v]) => !SKIP_DIFF_KEYS.has(k) && v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .slice(0, 4)
    .join(' · ')
}

function buildTimeline(trip: Trip, auditLogs: AuditLog[]): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // Derived from trip fields
  if (trip.created_at) {
    events.push({
      id: 'created',
      date: trip.created_at,
      action: 'Viagem criada',
      user: trip.driver_name ?? undefined,
      synthetic: true,
    })
  }
  if (trip.sent_at) {
    events.push({
      id: 'sent',
      date: trip.sent_at,
      action: 'Enviado para central',
      user: trip.driver_name ?? undefined,
      synthetic: true,
    })
  }

  // From audit_logs
  for (const log of auditLogs) {
    const detail = buildDiffDetail(log.diff)
    events.push({
      id: log.id,
      date: log.created_at,
      action: ACTION_LABELS[log.action] ?? log.action,
      user: log.user_name ?? undefined,
      detail: detail || undefined,
    })
  }

  // Sort by date ascending
  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

// ── Main component ────────────────────────────────────────────────────────────

export function TripDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const { user, role } = useAuthContext()
  const { isMotorista, isCentral } = useRole(role)
  const { approveTrip, rejectTrip, requestCorrection, submitTrip, updateAndResubmitTrip, correctTrip } = useTripActions()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<TripExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [valorTotal, setValorTotal] = useState('')
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [motivoCorrecao, setMotivoCorrecao] = useState('')
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [requestingCorrection, setRequestingCorrection] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [sigUrls, setSigUrls] = useState<Record<string, string>>({})
  const [showWhatsappDialog, setShowWhatsappDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [saving, setSaving] = useState(false)

  const { saveDraftLocally, getDraftLocally, removeDraftLocally } = useOfflineQueue()

  // Auto-generate PDF when approved (either from this page's action or from navigation state)
  const shouldAutoGenPDF = useRef(!!navState?.autoGeneratePDF)

  const canApproveOrReject =
    !!trip && isCentral && (trip.status === 'enviado' || trip.status === 'pendente')
  const reviewDraftId = id ? `trip_review_${id}` : null
  const draftRestoredRef = useRef(false)

  useEffect(() => {
    if (!id) return
    fetchTrip()
    fetchAuditLogs()
  }, [id])

  // Restaura valor/motivo digitados se o app recarregou no meio da revisão
  useEffect(() => {
    if (!canApproveOrReject || draftRestoredRef.current || !reviewDraftId) return
    draftRestoredRef.current = true
    const draft = getDraftLocally(reviewDraftId) as {
      valorTotal?: string
      motivoRecusa?: string
      motivoCorrecao?: string
    } | null
    if (!draft) return
    if (draft.valorTotal) setValorTotal(draft.valorTotal)
    if (draft.motivoRecusa) setMotivoRecusa(draft.motivoRecusa)
    if (draft.motivoCorrecao) setMotivoCorrecao(draft.motivoCorrecao)
  }, [canApproveOrReject, reviewDraftId, getDraftLocally])

  // Salva o que foi digitado para não perder se o app recarregar
  useEffect(() => {
    if (!canApproveOrReject || !reviewDraftId) return
    if (!valorTotal && !motivoRecusa && !motivoCorrecao) {
      removeDraftLocally(reviewDraftId)
      return
    }
    saveDraftLocally(reviewDraftId, { valorTotal, motivoRecusa, motivoCorrecao })
  }, [canApproveOrReject, reviewDraftId, valorTotal, motivoRecusa, motivoCorrecao, saveDraftLocally, removeDraftLocally])

  const fetchTrip = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('trips')
        .select(`*, passengers(*), photos(*), signatures(*), approvals(*)`)
        .eq('id', id!)
        .single()

      if (error) throw error
      const t = data as Trip
      setTrip(t)
      setValorTotal(t.valor_total?.toString() ?? '')

      // Private buckets require signed URLs (1 hour expiry)
      const urlMap: Record<string, string> = {}
      for (const photo of t.photos ?? []) {
        const { data: urlData } = await supabase.storage
          .from('trip-photos')
          .createSignedUrl(photo.storage_path, 3600)
        if (urlData?.signedUrl) urlMap[photo.id] = urlData.signedUrl
      }
      setPhotoUrls(urlMap)

      const sigMap: Record<string, string> = {}
      for (const sig of t.signatures ?? []) {
        const { data: urlData } = await supabase.storage
          .from('signatures')
          .createSignedUrl(sig.storage_path, 3600)
        if (urlData?.signedUrl) sigMap[sig.id] = urlData.signedUrl
      }
      setSigUrls(sigMap)

      const { data: expensesData } = await supabase
        .from('trip_expenses')
        .select('*')
        .eq('trip_id', id!)
      setExpenses((expensesData as TripExpense[]) ?? [])
    } catch {
      toast.error('Erro ao carregar viagem')
      navigate('/trips')
    } finally {
      setLoading(false)
    }
  }

  const fetchAuditLogs = async () => {
    if (!id) return
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity', 'trips')
      .eq('entity_id', id)
      .order('created_at', { ascending: true })
    setAuditLogs((data as AuditLog[]) ?? [])
  }

  // Trigger auto PDF generation after approval
  useEffect(() => {
    if (
      shouldAutoGenPDF.current &&
      !loading &&
      trip &&
      (trip.status === 'aprovado' || trip.status === 'recusado')
    ) {
      shouldAutoGenPDF.current = false
      handleGeneratePDF(trip)
    }
  }, [loading, trip?.id, trip?.status])

  const handleApprove = async () => {
    const valor = parseFloat(valorTotal)
    if (!valor || valor <= 0) {
      toast.error('Informe o valor total antes de aprovar')
      return
    }
    setApproving(true)
    try {
      await approveTrip(trip!.id, valor, user!.id)
      setShowApproveDialog(false)
      shouldAutoGenPDF.current = true
      if (reviewDraftId) removeDraftLocally(reviewDraftId)
      fetchTrip()
      fetchAuditLogs()
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async () => {
    if (motivoRecusa.trim().length < 10) {
      toast.error('Informe um motivo com pelo menos 10 caracteres')
      return
    }
    setRejecting(true)
    try {
      await rejectTrip(trip!.id, motivoRecusa, user!.id)
      setShowRejectDialog(false)
      setMotivoRecusa('')
      shouldAutoGenPDF.current = true
      if (reviewDraftId) removeDraftLocally(reviewDraftId)
      fetchTrip()
      fetchAuditLogs()
    } finally {
      setRejecting(false)
    }
  }

  const handleRequestCorrection = async () => {
    if (motivoCorrecao.trim().length < 10) {
      toast.error('Descreva o motivo com pelo menos 10 caracteres')
      return
    }
    setRequestingCorrection(true)
    try {
      await requestCorrection(trip!.id, motivoCorrecao, user!.id)
      setShowCorrectionDialog(false)
      setMotivoCorrecao('')
      if (reviewDraftId) removeDraftLocally(reviewDraftId)
      fetchTrip()
      fetchAuditLogs()
    } finally {
      setRequestingCorrection(false)
    }
  }

  const handleResubmit = async () => {
    setResubmitting(true)
    try {
      await submitTrip(trip!.id, user!.id)
      setShowEditDialog(false)
      fetchTrip()
      fetchAuditLogs()
    } finally {
      setResubmitting(false)
    }
  }

  const handleSaveAndResubmit = async () => {
    if (!editForm) return
    const kmI = parseFloat(editForm.km_inicial)
    const kmF = parseFloat(editForm.km_final)
    if (!editForm.placa.trim()) { toast.error('Informe a placa'); return }
    if (!editForm.data) { toast.error('Informe a data'); return }
    if (isNaN(kmI) || isNaN(kmF)) { toast.error('KMs inválidos'); return }
    if (kmF < kmI) { toast.error('KM final deve ser maior ou igual ao inicial'); return }
    if (editForm.passengers.some((p) => !p.nome.trim())) {
      toast.error('Preencha o nome de todos os passageiros')
      return
    }

    setSaving(true)
    try {
      // Upload replacement photos while trip is still in 'correcao' (required by RLS)
      for (const [photoId, replacement] of Object.entries(editForm.photoFiles)) {
        if (!replacement) continue
        const photo = trip!.photos?.find((p) => p.id === photoId)
        if (!photo) continue
        const ext = replacement.file.name.split('.').pop() ?? 'jpg'
        const path = `${trip!.id}/${photo.tipo}-${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('trip-photos')
          .upload(path, replacement.file, { upsert: true })
        if (uploadError) { toast.error('Erro ao enviar foto'); throw uploadError }
        await supabase.from('photos').update({ storage_path: path }).eq('id', photoId)
      }

      await updateAndResubmitTrip(
        trip!.id,
        {
          data: editForm.data,
          placa: editForm.placa.trim().toUpperCase(),
          base: editForm.base,
          tipo_viagem: editForm.tipo_viagem as TripType,
          hora_inicial: editForm.hora_inicial,
          hora_final: editForm.hora_final,
          hora_parada: editForm.hora_parada || null,
          km_inicial: kmI,
          km_final: kmF,
          total_km: kmF - kmI,
          inicio_base: editForm.inicio_base,
          final_base: editForm.final_base,
          embarque_empregado: editForm.embarque_empregado,
          desembarque_empregado: editForm.desembarque_empregado,
          descricao_viagem: editForm.justificativa,
          justificativa: editForm.justificativa,
          setor: editForm.setor,
        },
        editForm.passengers.filter((p) => p.nome.trim()),
        user!.id,
      )
      setShowEditDialog(false)
      Object.values(editForm.photoFiles).forEach((pf) => { if (pf) URL.revokeObjectURL(pf.previewUrl) })
      fetchTrip()
      fetchAuditLogs()
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCorrection = async () => {
    if (!editForm) return
    const kmI = parseFloat(editForm.km_inicial)
    const kmF = parseFloat(editForm.km_final)
    if (!editForm.placa.trim()) { toast.error('Informe a placa'); return }
    if (!editForm.data) { toast.error('Informe a data'); return }
    if (isNaN(kmI) || isNaN(kmF)) { toast.error('KMs inválidos'); return }
    if (kmF < kmI) { toast.error('KM final deve ser maior ou igual ao inicial'); return }
    if (editForm.passengers.some((p) => !p.nome.trim())) {
      toast.error('Preencha o nome de todos os passageiros')
      return
    }

    setSaving(true)
    try {
      for (const [photoId, replacement] of Object.entries(editForm.photoFiles)) {
        if (!replacement) continue
        const photo = trip!.photos?.find((p) => p.id === photoId)
        if (!photo) continue
        const ext = replacement.file.name.split('.').pop() ?? 'jpg'
        const path = `${trip!.id}/${photo.tipo}-${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('trip-photos')
          .upload(path, replacement.file, { upsert: true })
        if (uploadError) { toast.error('Erro ao enviar foto'); throw uploadError }
        await supabase.from('photos').update({ storage_path: path }).eq('id', photoId)
      }

      await correctTrip(
        trip!.id,
        {
          data: editForm.data,
          placa: editForm.placa.trim().toUpperCase(),
          base: editForm.base,
          tipo_viagem: editForm.tipo_viagem as TripType,
          hora_inicial: editForm.hora_inicial,
          hora_final: editForm.hora_final,
          hora_parada: editForm.hora_parada || null,
          km_inicial: kmI,
          km_final: kmF,
          total_km: kmF - kmI,
          inicio_base: editForm.inicio_base,
          final_base: editForm.final_base,
          embarque_empregado: editForm.embarque_empregado,
          desembarque_empregado: editForm.desembarque_empregado,
          descricao_viagem: editForm.justificativa,
          justificativa: editForm.justificativa,
          setor: editForm.setor,
        },
        editForm.passengers.filter((p) => p.nome.trim()),
        user!.id,
      )
      setShowEditDialog(false)
      Object.values(editForm.photoFiles).forEach((pf) => { if (pf) URL.revokeObjectURL(pf.previewUrl) })
      fetchTrip()
      fetchAuditLogs()
    } finally {
      setSaving(false)
    }
  }

  const handleGeneratePDF = async (currentTrip?: Trip) => {
    const t = currentTrip ?? trip
    if (!t) return
    setGeneratingPDF(true)
    try {
      const blob = await generateTripPDF(t, photoUrls, sigUrls)

      // Upload e salva path no banco
      let savedPath: string | null = null
      try {
        await saveTripPDF(t.id, t.protocolo, blob)
        savedPath = `trips/${t.id}/${t.protocolo}.pdf`
      } catch (saveErr) {
        const msg = saveErr instanceof Error ? saveErr.message : 'Erro desconhecido'
        toast.warning(`PDF baixado localmente, mas não salvou no servidor: ${msg}`)
      }

      await logAudit({
        entity: 'trips',
        entity_id: t.id,
        action: 'PDF_GERADO',
        by_user: user!.id,
        diff: { protocolo: t.protocolo },
      })

      toast.success(savedPath ? 'PDF gerado e salvo com sucesso!' : 'PDF baixado localmente.')

      // Atualiza do banco — e garante pdf_path no estado mesmo se o fetch vier atrasado
      await fetchTrip()
      fetchAuditLogs()
      if (savedPath) {
        setTrip((prev) =>
          prev ? { ...prev, pdf_path: savedPath!, pdf_generated_at: new Date().toISOString() } : prev,
        )
      }
    } catch (err) {
      console.error('[PDF] Erro ao gerar:', err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erro ao gerar PDF: ${msg}`)
    } finally {
      setGeneratingPDF(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!trip) return null

  const canResubmit = isMotorista && (trip.status === 'correcao' || trip.status === 'aprovado' || trip.status === 'recusado')
  const timeline = buildTimeline(trip, auditLogs)
  const pdfPublicUrl = trip.pdf_path
    ? supabase.storage.from('trip-documents').getPublicUrl(trip.pdf_path).data.publicUrl
    : null

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="touch-target rounded-xl hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-xl font-semibold">{formatVoucherLabel(trip)}</h1>
            <StatusBadge status={trip.status} />
            {trip.pdf_path && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <FileCheck2 className="h-3 w-3" />
                PDF salvo
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDate(trip.data)} · {trip.placa}
          </p>
        </div>

        {/* PDF + WhatsApp buttons — only for supervisor / admin */}
        {isCentral && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setEditForm(initEditForm(trip)); setShowEditDialog(true) }}
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Corrigir</span>
            </Button>
            {pdfPublicUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={pdfPublicUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Abrir PDF</span>
                </a>
              </Button>
            )}
            <Button
              variant={pdfPublicUrl ? 'ghost' : 'outline'}
              size="sm"
              onClick={() => handleGeneratePDF()}
              disabled={generatingPDF}
            >
              {generatingPDF
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">{pdfPublicUrl ? 'Regerar' : 'PDF'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWhatsappDialog(true)}
              className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </Button>
          </div>
        )}
      </div>

      {/* Rejection notice */}
      {trip.motivo_recusa && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-400">Viagem Recusada</p>
            <p className="text-sm text-muted-foreground mt-0.5">{trip.motivo_recusa}</p>
          </div>
        </div>
      )}

      {/* Correction notice */}
      {trip.status === 'correcao' && trip.motivo_correcao && (
        <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-400">Correção Solicitada</p>
            <p className="text-sm text-muted-foreground mt-0.5">{trip.motivo_correcao}</p>
          </div>
          {canResubmit && (
            <Button
              size="sm"
              onClick={() => { setEditForm(initEditForm(trip)); setShowEditDialog(true) }}
              className="flex-shrink-0 bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Pencil className="h-4 w-4" />
              Corrigir e Reenviar
            </Button>
          )}
        </div>
      )}

      {/* Motorista pode corrigir viagem já analisada (aprovada ou recusada) */}
      {canResubmit && trip.status !== 'correcao' && (
        <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-400">Viagem já analisada</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Identificou um erro? Corrija os dados e a viagem voltará para análise da central.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => { setEditForm(initEditForm(trip)); setShowEditDialog(true) }}
            className="flex-shrink-0 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Pencil className="h-4 w-4" />
            Corrigir Viagem
          </Button>
        </div>
      )}

      {/* Central analysis panel */}
      {canApproveOrReject && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-xl border border-primary/20 bg-primary/5 space-y-4"
        >
          <h3 className="font-display font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Análise da Central
          </h3>
          <div className="space-y-1.5">
            <Label>Valor Total (R$) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={valorTotal}
              onChange={(e) => setValorTotal(e.target.value)}
              placeholder="0,00"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Obrigatório para aprovação. PDF será gerado automaticamente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="success"
              onClick={() => setShowApproveDialog(true)}
              disabled={!valorTotal || parseFloat(valorTotal) <= 0}
            >
              <CheckCircle2 className="h-4 w-4" />
              Aprovar
            </Button>
            <Button variant="outline" onClick={() => setShowCorrectionDialog(true)}>
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              Solicitar Correção
            </Button>
            <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
              <XCircle className="h-4 w-4" />
              Recusar
            </Button>
          </div>
        </motion.div>
      )}

      {/* Trip data sections */}
      <div className="grid gap-4">
        <DetailSection title="Dados Básicos" icon={Car}>
          <DetailGrid>
            <DetailItem label="Taxista" value={trip.driver_name ?? '-'} />
            <DetailItem label="Placa" value={trip.placa} />
            <DetailItem label="Data" value={formatDate(trip.data)} />
            <DetailItem label="Tipo de Viagem" value={TRIP_TYPE_LABELS[trip.tipo_viagem]} />
            <DetailItem label="Setor" value={trip.setor} />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Horários e Quilometragem" icon={Clock}>
          <DetailGrid>
            <DetailItem label="Hora Inicial" value={formatTime(trip.hora_inicial)} />
            <DetailItem label="Hora Final" value={formatTime(trip.hora_final)} />
            {trip.hora_parada && <DetailItem label="Hora Parada" value={trip.hora_parada} />}
            <DetailItem label="KM Inicial" value={trip.km_inicial?.toString()} />
            <DetailItem label="KM Final" value={trip.km_final?.toString()} />
            <DetailItem label="Total KM" value={trip.total_km ? `${trip.total_km} km` : '-'} highlight />
          </DetailGrid>
        </DetailSection>

        {expenses.length > 0 && (
          <DetailSection title="Despesas" icon={Receipt}>
            <div className="space-y-2">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/20">
                  <div>
                    <p className="text-sm font-medium">{e.tipo}</p>
                    {e.observacao && (
                      <p className="text-xs text-muted-foreground">{e.observacao}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-emerald-400 whitespace-nowrap">
                    {formatCurrency(e.valor)}
                  </p>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40">
                <p className="text-sm font-semibold">Total de Despesas</p>
                <p className="text-sm font-bold text-emerald-400 whitespace-nowrap">
                  {formatCurrency(expenses.reduce((s, e) => s + e.valor, 0))}
                </p>
              </div>
            </div>
          </DetailSection>
        )}

        <DetailSection title="Valor Total" icon={DollarSign}>
          {trip.valor_total ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-2xl font-display font-bold text-emerald-400">
                {formatCurrency(trip.valor_total)}
              </div>
              {trip.valor_definido_em && (
                <div className="text-xs text-muted-foreground">
                  Definido em {formatDateTime(trip.valor_definido_em)}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Lock className="h-4 w-4 text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-400">
                  {isMotorista ? 'Aguardando cálculo da central' : 'Ainda não definido — informe o valor acima para aprovar'}
                </p>
                <p className="text-xs text-muted-foreground">Será preenchido após aprovação</p>
              </div>
            </div>
          )}
        </DetailSection>

        <DetailSection title="Locais da Viagem" icon={MapPin}>
          <DetailGrid>
            <DetailItem label="Início da Base" value={trip.inicio_base} />
            <DetailItem label="Final da Base" value={trip.final_base} />
            <DetailItem label="Embarque" value={trip.embarque_empregado} />
            <DetailItem label="Desembarque" value={trip.desembarque_empregado} />
          </DetailGrid>
        </DetailSection>

        {trip.passengers && trip.passengers.length > 0 && (
          <DetailSection title="Passageiros" icon={User}>
            <div className="space-y-2">
              {trip.passengers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{p.nome}</p>
                    {p.matricula && (
                      <p className="text-xs text-muted-foreground">Mat: {p.matricula}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </DetailSection>
        )}

        <DetailSection title="Justificativa" icon={FileText}>
          <p className="text-sm text-foreground bg-muted/20 p-4 rounded-xl leading-relaxed">
            {trip.justificativa}
          </p>
        </DetailSection>

        {trip.photos && trip.photos.length > 0 && (
          <DetailSection title="Fotos da Quilometragem" icon={Camera}>
            <div className="grid grid-cols-2 gap-4">
              {trip.photos.map((photo) => (
                <div key={photo.id} className="space-y-1.5">
                  <p className="label-text">
                    {photo.tipo === 'km_inicial' ? 'KM Inicial' : 'KM Final'}
                  </p>
                  {photoUrls[photo.id] ? (
                    <img
                      src={photoUrls[photo.id]}
                      alt={photo.tipo}
                      className="w-full h-36 object-cover rounded-xl border border-border"
                    />
                  ) : (
                    <div className="w-full h-36 rounded-xl bg-muted/30 border border-border flex items-center justify-center">
                      <Camera className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </DetailSection>
        )}

        {trip.signatures && trip.signatures.length > 0 && (
          <DetailSection title="Assinaturas" icon={PenLine}>
            <div className="grid grid-cols-2 gap-4">
              {trip.signatures.map((sig) => (
                <div key={sig.id} className="space-y-1.5">
                  <p className="label-text">
                    {sig.tipo === 'passageiro' ? 'Passageiro' : 'Motorista'}
                  </p>
                  <div className="text-xs text-muted-foreground">{sig.signer_name}</div>
                  {sigUrls[sig.id] ? (
                    <img
                      src={sigUrls[sig.id]}
                      alt={sig.tipo}
                      className="w-full h-20 object-contain rounded-xl border border-border bg-white/5 p-2"
                    />
                  ) : (
                    <div className="w-full h-20 rounded-xl bg-muted/30 border border-border flex items-center justify-center">
                      <PenLine className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </DetailSection>
        )}

        {/* Histórico da viagem */}
        {timeline.length > 0 && (
          <DetailSection title="Histórico" icon={History}>
            <div className="space-y-0">
              {timeline.map((event, i) => (
                <TimelineItem
                  key={event.id}
                  event={event}
                  isLast={i === timeline.length - 1}
                />
              ))}
            </div>
          </DetailSection>
        )}
      </div>

      {/* Confirm approve dialog */}
      <ConfirmDialog
        open={showApproveDialog}
        onOpenChange={setShowApproveDialog}
        title="Aprovar Viagem"
        description={`Confirmar aprovação da viagem ${trip.protocolo} com valor total de ${formatCurrency(parseFloat(valorTotal || '0'))}? O PDF será gerado automaticamente.`}
        confirmLabel="Aprovar e Gerar PDF"
        variant="success"
        onConfirm={handleApprove}
        loading={approving}
      />

      {/* Reject dialog */}
      <Dialog open={showRejectDialog} onOpenChange={(v) => { setShowRejectDialog(v); if (!v) setMotivoRecusa('') }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Recusar Viagem</DialogTitle>
            <DialogDescription>
              Informe o motivo da recusa. O PDF será gerado automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-1">
            <Label className="text-xs">Motivo *</Label>
            <Textarea
              value={motivoRecusa}
              onChange={(e) => setMotivoRecusa(e.target.value)}
              placeholder="Descreva o motivo da recusa (mínimo 10 caracteres)..."
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{motivoRecusa.trim().length} / mín. 10 caracteres</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} disabled={rejecting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || motivoRecusa.trim().length < 10}
            >
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Recusar e Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp dialog — only for supervisor/admin */}
      {isCentral && (
        <SendWhatsappDialog
          open={showWhatsappDialog}
          onOpenChange={setShowWhatsappDialog}
          trip={trip}
          userId={user!.id}
        />
      )}

      {/* Edit & resubmit dialog — motorista corrects trip */}
      {editForm && (
        <Dialog open={showEditDialog} onOpenChange={(v) => {
          if (!saving && !resubmitting) {
            if (!v && editForm) Object.values(editForm.photoFiles).forEach((pf) => { if (pf) URL.revokeObjectURL(pf.previewUrl) })
            setShowEditDialog(v)
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
              <DialogTitle className="font-display">
                {isCentral ? `Corrigir Viagem (Central) · ${trip.protocolo}` : `Corrigir Viagem · ${trip.protocolo}`}
              </DialogTitle>
              <DialogDescription>
                {isCentral
                  ? 'Edite os campos necessários. O status atual da viagem será mantido.'
                  : 'Edite os campos necessários e reenvie para a central aprovar.'}
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
              {/* Correction reminder */}
              {trip.motivo_correcao && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-orange-400">O que corrigir: </span>
                    <span className="text-muted-foreground">{trip.motivo_correcao}</span>
                  </div>
                </div>
              )}

              {/* Dados Básicos */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dados Básicos</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data</Label>
                    <Input
                      type="date"
                      value={editForm.data}
                      onChange={(e) => setEditForm((f) => f ? { ...f, data: e.target.value } : f)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Placa</Label>
                    <Input
                      value={editForm.placa}
                      onChange={(e) => setEditForm((f) => f ? { ...f, placa: e.target.value.toUpperCase() } : f)}
                      placeholder="ABC-1234"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de Viagem</Label>
                    <Select value={editForm.tipo_viagem} onValueChange={(v) => setEditForm((f) => f ? { ...f, tipo_viagem: v } : f)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="municipal">Municipal</SelectItem>
                        <SelectItem value="intermunicipal">Intermunicipal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs">Setor</Label>
                    <Select value={editForm.setor} onValueChange={(v) => setEditForm((f) => f ? { ...f, setor: v } : f)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SETORES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Horários & KM */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Horários & Quilometragem</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hora Inicial</Label>
                    <Input type="time" value={editForm.hora_inicial} onChange={(e) => setEditForm((f) => f ? { ...f, hora_inicial: e.target.value } : f)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hora Final</Label>
                    <Input type="time" value={editForm.hora_final} onChange={(e) => setEditForm((f) => f ? { ...f, hora_final: e.target.value } : f)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hora Parada (opcional)</Label>
                    <Input type="time" value={editForm.hora_parada} onChange={(e) => setEditForm((f) => f ? { ...f, hora_parada: e.target.value } : f)} />
                  </div>
                  <div />
                  <div className="space-y-1.5">
                    <Label className="text-xs">KM Inicial</Label>
                    <Input type="number" min="0" value={editForm.km_inicial} onChange={(e) => setEditForm((f) => f ? { ...f, km_inicial: e.target.value } : f)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">KM Final</Label>
                    <Input type="number" min="0" value={editForm.km_final} onChange={(e) => setEditForm((f) => f ? { ...f, km_final: e.target.value } : f)} />
                  </div>
                </div>
                {editForm.km_inicial && editForm.km_final && parseFloat(editForm.km_final) >= parseFloat(editForm.km_inicial) && (
                  <p className="text-xs text-primary font-medium">
                    Total: {parseFloat(editForm.km_final) - parseFloat(editForm.km_inicial)} km
                  </p>
                )}
              </div>

              {/* Locais */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Locais da Viagem</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Início da Base</Label>
                    <Input value={editForm.inicio_base} onChange={(e) => setEditForm((f) => f ? { ...f, inicio_base: e.target.value } : f)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Final da Base</Label>
                    <Input value={editForm.final_base} onChange={(e) => setEditForm((f) => f ? { ...f, final_base: e.target.value } : f)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Embarque do Empregado</Label>
                    <Input value={editForm.embarque_empregado} onChange={(e) => setEditForm((f) => f ? { ...f, embarque_empregado: e.target.value } : f)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Desembarque do Empregado</Label>
                    <Input value={editForm.desembarque_empregado} onChange={(e) => setEditForm((f) => f ? { ...f, desembarque_empregado: e.target.value } : f)} />
                  </div>
                </div>
              </div>

              {/* Justificativa */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Justificativa</p>
                <Textarea
                  rows={3}
                  className="resize-none"
                  value={editForm.justificativa}
                  onChange={(e) => setEditForm((f) => f ? { ...f, justificativa: e.target.value } : f)}
                />
              </div>

              {/* Passageiros */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Passageiros</p>
                <div className="space-y-2">
                  {editForm.passengers.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        placeholder="Nome do passageiro"
                        value={p.nome}
                        onChange={(e) => setEditForm((f) => {
                          if (!f) return f
                          const passengers = [...f.passengers]
                          passengers[i] = { ...passengers[i], nome: e.target.value }
                          return { ...f, passengers }
                        })}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Matrícula"
                        value={p.matricula}
                        onChange={(e) => setEditForm((f) => {
                          if (!f) return f
                          const passengers = [...f.passengers]
                          passengers[i] = { ...passengers[i], matricula: e.target.value }
                          return { ...f, passengers }
                        })}
                        className="w-28"
                      />
                      <button
                        type="button"
                        onClick={() => setEditForm((f) => f ? { ...f, passengers: f.passengers.filter((_, idx) => idx !== i) } : f)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditForm((f) => f ? { ...f, passengers: [...f.passengers, { nome: '', matricula: '' }] } : f)}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar Passageiro
                  </Button>
                </div>
              </div>

              {/* Fotos da Quilometragem */}
              {(isMotorista || isCentral) && trip.photos && trip.photos.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fotos da Quilometragem</p>
                  <div className="grid grid-cols-2 gap-4">
                    {trip.photos.map((photo) => {
                      const replacement = editForm.photoFiles[photo.id]
                      const displayUrl = replacement ? replacement.previewUrl : photoUrls[photo.id]
                      return (
                        <div key={photo.id} className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {photo.tipo === 'km_inicial' ? 'KM Inicial' : 'KM Final'}
                          </p>
                          {displayUrl ? (
                            <img
                              src={displayUrl}
                              alt={photo.tipo}
                              className="w-full h-32 object-cover rounded-xl border border-border"
                            />
                          ) : (
                            <div className="w-full h-32 rounded-xl bg-muted/30 border border-border flex items-center justify-center">
                              <Camera className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          {replacement && (
                            <p className="text-xs text-orange-400 font-medium">Nova foto selecionada</p>
                          )}
                          <label className="flex items-center gap-1.5 text-xs text-primary cursor-pointer hover:opacity-75 transition-opacity">
                            <Camera className="h-3.5 w-3.5" />
                            {replacement ? 'Trocar foto' : 'Substituir foto'}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                const previewUrl = URL.createObjectURL(file)
                                setEditForm((f) => f ? {
                                  ...f,
                                  photoFiles: { ...f.photoFiles, [photo.id]: { file, previewUrl } },
                                } : f)
                              }}
                            />
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0 flex-wrap gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={saving || resubmitting}>
                Cancelar
              </Button>
              {trip.status === 'correcao' && (
                <Button
                  variant="ghost"
                  onClick={handleResubmit}
                  disabled={saving || resubmitting}
                  className="text-muted-foreground"
                >
                  {resubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Reenviar sem alterações
                </Button>
              )}
              {isCentral ? (
                <Button
                  onClick={handleSaveCorrection}
                  disabled={saving || resubmitting}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Salvar Correção
                </Button>
              ) : (
                <Button
                  onClick={handleSaveAndResubmit}
                  disabled={saving || resubmitting}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Salvar e Reenviar
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Correction dialog */}
      <Dialog open={showCorrectionDialog} onOpenChange={(v) => { setShowCorrectionDialog(v); if (!v) setMotivoCorrecao('') }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Solicitar Correção</DialogTitle>
            <DialogDescription>
              Descreva o que o motorista precisa corrigir antes de aprovar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-1">
            <Label className="text-xs">O que precisa ser corrigido? *</Label>
            <Textarea
              value={motivoCorrecao}
              onChange={(e) => setMotivoCorrecao(e.target.value)}
              placeholder="Ex: Foto do odômetro final está ilegível, reenviar com imagem clara..."
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{motivoCorrecao.trim().length} / mín. 10 caracteres</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCorrectionDialog(false)} disabled={requestingCorrection}>
              Cancelar
            </Button>
            <Button
              onClick={handleRequestCorrection}
              disabled={requestingCorrection || motivoCorrecao.trim().length < 10}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {requestingCorrection
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <AlertTriangle className="h-4 w-4" />}
              Solicitar Correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Timeline item ─────────────────────────────────────────────────────────────

const TIMELINE_ICONS: Record<string, React.ElementType> = {
  'Viagem criada': FilePlus2,
  'Enviado para central': Send,
  'Aprovado': CheckCircle2,
  'Recusado': XCircle,
  'Correção solicitada': AlertTriangle,
  'Correção enviada': Send,
  'Correção pela central': Pencil,
  'PDF gerado': FileCheck2,
  'PDF enviado por WhatsApp': MessageCircle,
}
const TIMELINE_COLORS: Record<string, string> = {
  'Viagem criada': 'bg-muted/40 text-muted-foreground',
  'Enviado para central': 'bg-blue-500/15 text-blue-400',
  'Aprovado': 'bg-emerald-500/15 text-emerald-400',
  'Recusado': 'bg-red-500/15 text-red-400',
  'Correção solicitada': 'bg-orange-500/15 text-orange-400',
  'Correção enviada': 'bg-blue-500/15 text-blue-400',
  'Correção pela central': 'bg-orange-500/15 text-orange-400',
  'PDF gerado': 'bg-purple-500/15 text-purple-400',
  'PDF enviado por WhatsApp': 'bg-emerald-500/15 text-emerald-400',
}

function TimelineItem({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const Icon = TIMELINE_ICONS[event.action] ?? Pencil
  const colorClass = TIMELINE_COLORS[event.action] ?? 'bg-muted/40 text-muted-foreground'

  return (
    <div className="flex gap-3 group">
      {/* Line + icon */}
      <div className="flex flex-col items-center">
        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', colorClass)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/50 my-1" />}
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{event.action}</span>
          {event.user && (
            <span className="text-xs text-muted-foreground">por {event.user}</span>
          )}
        </div>
        {event.detail && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">{event.detail}</p>
        )}
        <p className="text-xs text-muted-foreground/50 mt-0.5 tabular-nums">
          {formatDateTime(event.date)}
        </p>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DetailSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-muted/20">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
}

function DetailItem({
  label,
  value,
  highlight,
}: {
  label: string
  value?: string
  highlight?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <p className="label-text">{label}</p>
      <p className={cn('text-sm', highlight ? 'font-bold text-primary' : 'text-foreground')}>
        {value || '-'}
      </p>
    </div>
  )
}
