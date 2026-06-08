import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Lock,
  Send,
  Save,
  Loader2,
  User,
  Car,
  MapPin,
  Clock,
  Camera,
  PenLine,
  Eye,
  WifiOff,
  RefreshCw,
  CloudOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TripStepper } from '@/components/trips/TripStepper'
import { PhotoCapture } from '@/components/trips/PhotoCapture'
import type { PhotoCaptureResult } from '@/components/trips/PhotoCapture'
import { SignaturePad } from '@/components/trips/SignaturePad'
import type { SignatureResult } from '@/components/trips/SignaturePad'
import { PageHeader } from '@/components/common/PageHeader'
import { useAuthContext } from '@/contexts/AuthContext'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useTripSync } from '@/hooks/useTripSync'
import type { PendingTripPayload } from '@/lib/offlineTrips'
import { submitTripToServer } from '@/lib/tripSubmission'
import { toast } from 'sonner'
import { SETORES } from '@/types/enums'
import { generateProtocol } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { TripType } from '@/types/enums'

const STEPS = [
  { label: 'Dados Básicos', description: 'Taxista, data, placa' },
  { label: 'Locais', description: 'Origem e destino' },
  { label: 'Passageiros', description: 'Lista de passageiros' },
  { label: 'Setor', description: 'Departamento' },
  { label: 'Justificativa', description: 'Motivo da viagem' },
  { label: 'Fotos', description: 'Registro obrigatório' },
  { label: 'Horários & KM', description: 'Tempos e quilometragem' },
  { label: 'Assinaturas', description: 'Assinatura digital' },
  { label: 'Revisão', description: 'Confirmar e enviar' },
]

interface PhotoState {
  originalFile?: File
  stampedFile?: File
  previewUrl?: string
  capturedAt?: string
  latitude?: number
  longitude?: number
  accuracy?: number
  address?: string
  locationDenied?: boolean
}

type SignatureState = Partial<SignatureResult>

interface FormState {
  taxista: string
  data: string
  placa: string
  base: string
  tipo_viagem: TripType | ''
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
}

export function NewTripPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuthContext()
  const [step, setStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [protocolo] = useState(() => generateProtocol())
  const [photoKmInicial, setPhotoKmInicial] = useState<PhotoState>({})
  const [photoKmFinal, setPhotoKmFinal] = useState<PhotoState>({})
  const [sigPassageiro, setSigPassageiro] = useState<SignatureState>({})
  const [sigMotorista, setSigMotorista] = useState<SignatureState>({})
  const [stepErrors, setStepErrors] = useState<Record<number, string>>({})

  const [formData, setFormData] = useState<FormState>({
    taxista: profile?.nome ?? '',
    data: new Date().toISOString().split('T')[0],
    placa: '',
    base: profile?.base ?? '',
    tipo_viagem: '',
    hora_inicial: '',
    hora_final: '',
    hora_parada: '',
    km_inicial: '',
    km_final: '',
    inicio_base: '',
    final_base: '',
    embarque_empregado: '',
    desembarque_empregado: '',
    justificativa: '',
    setor: '',
    passengers: [{ nome: '', matricula: '' }],
  })

  const { isOnline, saveDraftLocally, getDraftLocally, removeDraftLocally } = useOfflineQueue()
  const { pendingTrips, queueTrip, retry: retrySync } = useTripSync(user?.id, profile?.base)
  const draftId = user ? `new_trip_${user.id}` : null
  const [draftAutoSaveEnabled, setDraftAutoSaveEnabled] = useState(false)

  // Ao abrir Nova Viagem: verifica se existe rascunho local salvo e oferece continuar/descartar
  useEffect(() => {
    if (!draftId) { setDraftAutoSaveEnabled(true); return }
    const draft = getDraftLocally(draftId) as FormState | null
    if (!draft) {
      setDraftAutoSaveEnabled(true)
      return
    }
    toast('Rascunho encontrado', {
      description: 'Você tem uma viagem não enviada salva neste dispositivo. Deseja continuar de onde parou?',
      duration: Infinity,
      action: {
        label: 'Continuar',
        onClick: () => {
          setFormData(draft)
          setDraftAutoSaveEnabled(true)
        },
      },
      cancel: {
        label: 'Descartar',
        onClick: () => {
          removeDraftLocally(draftId)
          setDraftAutoSaveEnabled(true)
        },
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Salva o rascunho local automaticamente conforme o formulário é preenchido
  useEffect(() => {
    if (!draftId || !draftAutoSaveEnabled) return
    saveDraftLocally(draftId, formData)
  }, [draftId, draftAutoSaveEnabled, formData, saveDraftLocally])

  const totalKm = (() => {
    const ini = parseFloat(formData.km_inicial)
    const fin = parseFloat(formData.km_final)
    if (!isNaN(ini) && !isNaN(fin) && fin >= ini) return fin - ini
    return null
  })()

  const updateField = (field: keyof FormState, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const updatePassenger = (index: number, field: 'nome' | 'matricula', value: string) => {
    setFormData((prev) => {
      const passengers = [...prev.passengers]
      passengers[index] = { ...passengers[index], [field]: value }
      return { ...prev, passengers }
    })
  }

  const addPassenger = () => {
    if (formData.passengers.length >= 10) return
    setFormData((prev) => ({
      ...prev,
      passengers: [...prev.passengers, { nome: '', matricula: '' }],
    }))
  }

  const removePassenger = (index: number) => {
    if (formData.passengers.length <= 1) return
    setFormData((prev) => ({
      ...prev,
      passengers: prev.passengers.filter((_, i) => i !== index),
    }))
  }

  const validateStep = (stepIndex: number): string | null => {
    switch (stepIndex) {
      case 0:
        if (!formData.taxista.trim()) return 'Nome do taxista obrigatório'
        if (!formData.data) return 'Data obrigatória'
        if (!formData.placa.trim()) return 'Placa obrigatória'
        if (!formData.tipo_viagem) return 'Tipo de viagem obrigatório'
        return null
      case 1:
        if (!formData.inicio_base.trim()) return 'Local de início obrigatório'
        if (!formData.final_base.trim()) return 'Local final obrigatório'
        if (!formData.embarque_empregado.trim()) return 'Local de embarque obrigatório'
        if (!formData.desembarque_empregado.trim()) return 'Local de desembarque obrigatório'
        return null
      case 2:
        if (formData.passengers.some((p) => !p.nome.trim())) return 'Todos os passageiros devem ter nome'
        if (formData.passengers.length === 0) return 'Pelo menos um passageiro é obrigatório'
        return null
      case 3:
        if (!formData.setor) return 'Setor obrigatório'
        return null
      case 4:
        if (formData.justificativa.trim().length < 10) return 'Justificativa deve ter pelo menos 10 caracteres'
        return null
      case 5:
        if (!photoKmInicial.previewUrl && !photoKmInicial.originalFile) return 'Foto da quilometragem inicial é obrigatória'
        if (!photoKmFinal.previewUrl && !photoKmFinal.originalFile) return 'Foto da quilometragem final é obrigatória'
        return null
      case 6:
        if (!formData.hora_inicial) return 'Hora inicial obrigatória'
        if (!formData.hora_final) return 'Hora final obrigatória'
        if (!formData.km_inicial) return 'KM inicial obrigatório'
        if (!formData.km_final) return 'KM final obrigatório'
        if (parseFloat(formData.km_final) < parseFloat(formData.km_inicial))
          return 'KM final não pode ser menor que KM inicial'
        return null
      case 7:
        if (!sigPassageiro.dataUrl) return 'Assinatura do passageiro é obrigatória'
        if (!sigMotorista.dataUrl) return 'Assinatura do motorista é obrigatória'
        return null
      default:
        return null
    }
  }

  const nextStep = () => {
    const error = validateStep(step)
    if (error) {
      setStepErrors((prev) => ({ ...prev, [step]: error }))
      toast.error(error)
      return
    }
    setStepErrors((prev) => ({ ...prev, [step]: '' }))
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]))
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const prevStep = () => setStep((s) => Math.max(s - 1, 0))

  // Monta a carga para a fila offline — fotos guardadas como Blob (IndexedDB
  // suporta nativamente) e assinaturas como dataURL, sem perder nenhum dado
  // preenchido pelo motorista mesmo sem conexão.
  const buildPendingPayload = (): PendingTripPayload => ({
    formData: { ...formData },
    totalKm,
    photoKmInicial: (photoKmInicial.originalFile || photoKmInicial.stampedFile) ? {
      originalBlob: photoKmInicial.originalFile,
      stampedBlob: photoKmInicial.stampedFile,
      capturedAt: photoKmInicial.capturedAt,
      latitude: photoKmInicial.latitude,
      longitude: photoKmInicial.longitude,
      accuracy: photoKmInicial.accuracy,
      address: photoKmInicial.address,
      locationDenied: photoKmInicial.locationDenied,
    } : undefined,
    photoKmFinal: (photoKmFinal.originalFile || photoKmFinal.stampedFile) ? {
      originalBlob: photoKmFinal.originalFile,
      stampedBlob: photoKmFinal.stampedFile,
      capturedAt: photoKmFinal.capturedAt,
      latitude: photoKmFinal.latitude,
      longitude: photoKmFinal.longitude,
      accuracy: photoKmFinal.accuracy,
      address: photoKmFinal.address,
      locationDenied: photoKmFinal.locationDenied,
    } : undefined,
    sigPassageiro: sigPassageiro.dataUrl ? {
      dataUrl: sigPassageiro.dataUrl,
      signerName: sigPassageiro.signerName,
      method: sigPassageiro.method,
      signedAt: sigPassageiro.signedAt,
    } : undefined,
    sigMotorista: sigMotorista.dataUrl ? {
      dataUrl: sigMotorista.dataUrl,
      signerName: sigMotorista.signerName,
      method: sigMotorista.method,
      signedAt: sigMotorista.signedAt,
    } : undefined,
  })

  const handleSubmit = async (isDraft: boolean) => {
    if (!isDraft) {
      const error = validateStep(7)
      if (error) {
        toast.error(error)
        return
      }
    }

    if (!user) {
      toast.error('Usuário não autenticado')
      return
    }

    setLoading(true)
    const tripId = crypto.randomUUID()

    try {
      // ── Tentativa online ─────────────────────────────────────────────────────
      // Timeout próprio de 8s: o Workbox NetworkFirst não aborta quando não há
      // cache, podendo travar 30-90s com WiFi sem internet.
      if (navigator.onLine) {
        try {
          await Promise.race([
            submitTripToServer({
              tripId,
              userId: user.id,
              protocolo,
              isDraft,
              formData,
              totalKm,
              profileBase: profile?.base,
              photoKmInicial,
              photoKmFinal,
              sigPassageiro,
              sigMotorista,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('submit_timeout')), 8000),
            ),
          ])
          if (draftId) removeDraftLocally(draftId)
          toast.success(
            isDraft ? 'Rascunho salvo com sucesso!' : `Viagem enviada! Protocolo: ${protocolo}`,
          )
          navigate('/trips')
          return
        } catch (err) {
          console.error('[NewTrip] Envio online falhou, salvando na fila offline:', err)
        }
      }

      // ── Fila offline — IndexedDB ──────────────────────────────────────────────
      // Timeout de 6s: se o IndexedDB travar (tx.onabort silencioso em alguns
      // Android WebViews), não deixa o botão girando para sempre.
      let savedToQueue = false
      try {
        await Promise.race([
          queueTrip({ id: tripId, protocolo, isDraft, payload: buildPendingPayload() }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('queue_timeout')), 6000),
          ),
        ])
        savedToQueue = true
      } catch (queueErr) {
        console.error('[NewTrip] Fila offline (IndexedDB) falhou:', queueErr)
      }

      if (savedToQueue) {
        if (draftId) removeDraftLocally(draftId)
        toast.success(
          isDraft
            ? 'Rascunho salvo neste dispositivo. Será sincronizado quando a internet voltar.'
            : 'Viagem salva localmente. Será enviada para a central quando a internet voltar.',
          { duration: 6000 },
        )
        navigate('/trips')
        return
      }

      // ── Último recurso: localStorage ─────────────────────────────────────────
      // IndexedDB travou ou não está disponível. Salva os dados do formulário
      // como JSON (fotos binárias são perdidas, mas o restante é preservado).
      // O autosave já mantém formData aqui continuamente; escrevemos explicitamente
      // para garantir que o passo atual está incluído.
      try {
        if (draftId) saveDraftLocally(draftId, formData)
        toast.success(
          isDraft
            ? 'Rascunho salvo (dados básicos, sem fotos). Conecte-se para sincronizar.'
            : 'Dados salvos localmente (sem fotos). Abra Nova Viagem com internet para reenviar.',
          { duration: 8000 },
        )
        navigate('/trips')
      } catch {
        toast.error(
          'Não foi possível salvar. Verifique o espaço disponível no dispositivo.',
          { duration: 8000 },
        )
      }
    } catch (err) {
      console.error('[NewTrip] Erro inesperado em handleSubmit:', err)
      toast.error('Erro ao salvar viagem. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold">Dados do Taxista</h3>
                <p className="text-xs text-muted-foreground">Informações básicas da viagem</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Nome do Taxista *</Label>
                <Input
                  value={formData.taxista}
                  onChange={(e) => updateField('taxista', e.target.value)}
                  placeholder="Nome completo do taxista"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input
                  type="date"
                  value={formData.data}
                  onChange={(e) => updateField('data', e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Placa do Veículo *</Label>
                <Input
                  value={formData.placa}
                  onChange={(e) => updateField('placa', e.target.value.toUpperCase())}
                  placeholder="ABC1234 ou ABC1D23"
                  maxLength={8}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de Viagem *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['municipal', 'intermunicipal'] as TripType[]).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => updateField('tipo_viagem', tipo)}
                      className={cn(
                        'h-11 rounded-xl border-2 text-sm font-medium transition-all capitalize',
                        formData.tipo_viagem === tipo
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      {tipo === 'municipal' ? 'Municipal' : 'Intermunicipal'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )

      case 6:
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold">Horários e Quilometragem</h3>
                <p className="text-xs text-muted-foreground">Registro de tempo e distância</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Hora Inicial *</Label>
                <Input
                  type="time"
                  value={formData.hora_inicial}
                  onChange={(e) => updateField('hora_inicial', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hora Final *</Label>
                <Input
                  type="time"
                  value={formData.hora_final}
                  onChange={(e) => updateField('hora_final', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hora Parada</Label>
                <Input
                  value={formData.hora_parada}
                  onChange={(e) => updateField('hora_parada', e.target.value)}
                  placeholder="Ex: 00:30"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>KM Inicial *</Label>
                <Input
                  type="number"
                  value={formData.km_inicial}
                  onChange={(e) => updateField('km_inicial', e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>KM Final *</Label>
                <Input
                  type="number"
                  value={formData.km_final}
                  onChange={(e) => updateField('km_final', e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total KM / HP</Label>
                <div className="h-11 flex items-center px-3 rounded-xl border border-border bg-secondary/50 text-sm font-semibold">
                  {totalKm !== null ? (
                    <span className="text-primary">{totalKm} km</span>
                  ) : (
                    <span className="text-muted-foreground">Auto calculado</span>
                  )}
                </div>
              </div>
            </div>

            {/* Valor Total locked */}
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-2.5">
                <Lock className="h-4 w-4 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-400">Valor Total</p>
                  <p className="text-xs text-muted-foreground">Aguardando cálculo da central</p>
                </div>
              </div>
            </div>
          </div>
        )

      case 1:
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold">Local da Viagem</h3>
                <p className="text-xs text-muted-foreground">Origem, destino e trajeto</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Início da Base *</Label>
                <Input
                  value={formData.inicio_base}
                  onChange={(e) => updateField('inicio_base', e.target.value)}
                  placeholder="Local de partida"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Final da Base *</Label>
                <Input
                  value={formData.final_base}
                  onChange={(e) => updateField('final_base', e.target.value)}
                  placeholder="Local de chegada"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Embarque do Empregado *</Label>
                <Input
                  value={formData.embarque_empregado}
                  onChange={(e) => updateField('embarque_empregado', e.target.value)}
                  placeholder="Local de embarque"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Desembarque do Empregado *</Label>
                <Input
                  value={formData.desembarque_empregado}
                  onChange={(e) => updateField('desembarque_empregado', e.target.value)}
                  placeholder="Local de desembarque"
                />
              </div>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold">Passageiros</h3>
                <p className="text-xs text-muted-foreground">
                  Lista de passageiros ({formData.passengers.length}/10)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {formData.passengers.map((p, i) => (
                <div key={i} className="flex gap-3 items-start p-4 rounded-xl border border-border bg-muted/20">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary mt-2">
                    {i + 1}
                  </div>
                  <div className="flex-1 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome *</Label>
                      <Input
                        value={p.nome}
                        onChange={(e) => updatePassenger(i, 'nome', e.target.value)}
                        placeholder="Nome completo"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Matrícula</Label>
                      <Input
                        value={p.matricula}
                        onChange={(e) => updatePassenger(i, 'matricula', e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                  {formData.passengers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePassenger(i)}
                      className="mt-2 p-1.5 rounded-lg text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {formData.passengers.length < 10 && (
              <Button type="button" variant="outline" size="sm" onClick={addPassenger}>
                <Plus className="h-4 w-4" />
                Adicionar Passageiro
              </Button>
            )}
          </div>
        )

      case 3:
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
                <Car className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold">Setor</h3>
                <p className="text-xs text-muted-foreground">Marque o setor correspondente</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SETORES.map((setor) => (
                <button
                  key={setor}
                  type="button"
                  onClick={() => updateField('setor', setor)}
                  className={cn(
                    'h-14 px-3 rounded-xl border-2 text-xs font-medium text-center transition-all leading-tight',
                    formData.setor === setor
                      ? 'border-primary bg-primary/15 text-primary shadow-sm'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {setor}
                </button>
              ))}
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
                <PenLine className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold">Justificativa</h3>
                <p className="text-xs text-muted-foreground">Descreva o motivo da viagem</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Justificativa da Viagem *</Label>
              <Textarea
                value={formData.justificativa}
                onChange={(e) => updateField('justificativa', e.target.value)}
                placeholder="Descreva detalhadamente o motivo desta viagem, incluindo o propósito e necessidade..."
                rows={6}
              />
              <div className="flex justify-end">
                <span className={cn(
                  'text-xs',
                  formData.justificativa.length < 10 ? 'text-destructive' : 'text-muted-foreground',
                )}>
                  {formData.justificativa.length} / 500 caracteres
                </span>
              </div>
            </div>
          </div>
        )

      case 5:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold">Fotos Obrigatórias</h3>
                <p className="text-xs text-muted-foreground">
                  Registre a quilometragem do veículo
                </p>
              </div>
            </div>

            <PhotoCapture
              label="Foto da Quilometragem Inicial"
              description="Fotografe o odômetro no início da viagem"
              previewUrl={photoKmInicial.previewUrl}
              stampMeta={{
                tipo: 'km_inicial',
                driverName: formData.taxista || profile?.nome || 'Motorista',
                base: formData.base || 'Base',
                protocolo,
              }}
              onCapture={(result: PhotoCaptureResult) => setPhotoKmInicial({
                originalFile: result.originalFile,
                stampedFile: result.stampedFile,
                previewUrl: result.previewUrl,
                capturedAt: result.capturedAt,
                latitude: result.latitude,
                longitude: result.longitude,
                accuracy: result.accuracy,
                address: result.address,
                locationDenied: result.locationDenied,
              })}
              error={stepErrors[5] && !photoKmInicial.previewUrl ? 'Foto obrigatória' : undefined}
            />

            <PhotoCapture
              label="Foto da Quilometragem Final"
              description="Fotografe o odômetro no final da viagem"
              previewUrl={photoKmFinal.previewUrl}
              stampMeta={{
                tipo: 'km_final',
                driverName: formData.taxista || profile?.nome || 'Motorista',
                base: formData.base || 'Base',
                protocolo,
              }}
              onCapture={(result: PhotoCaptureResult) => setPhotoKmFinal({
                originalFile: result.originalFile,
                stampedFile: result.stampedFile,
                previewUrl: result.previewUrl,
                capturedAt: result.capturedAt,
                latitude: result.latitude,
                longitude: result.longitude,
                accuracy: result.accuracy,
                address: result.address,
                locationDenied: result.locationDenied,
              })}
              error={
                stepErrors[5] && !photoKmFinal.previewUrl && photoKmInicial.previewUrl
                  ? 'Foto obrigatória'
                  : undefined
              }
            />
          </div>
        )

      case 7:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
                <PenLine className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold">Assinaturas Digitais</h3>
                <p className="text-xs text-muted-foreground">
                  Digitada é a opção mais profissional e recomendada
                </p>
              </div>
            </div>

            <SignaturePad
              label="Assinatura do Passageiro Principal"
              signerType="passenger"
              defaultName={formData.passengers[0]?.nome ?? ''}
              defaultMatricula={formData.passengers[0]?.matricula ?? ''}
              onSave={(result) => setSigPassageiro(result)}
              savedResult={sigPassageiro}
              error={stepErrors[7] && !sigPassageiro.dataUrl ? 'Assinatura do passageiro é obrigatória' : undefined}
            />

            <div className="border-t border-border pt-6">
              <SignaturePad
                label="Assinatura do Motorista / Taxista"
                signerType="driver"
                driverName={formData.taxista || profile?.nome || ''}
                onSave={(result) => setSigMotorista(result)}
                savedResult={sigMotorista}
                error={
                  stepErrors[7] && !sigMotorista.dataUrl && sigPassageiro.dataUrl
                    ? 'Assinatura do motorista é obrigatória'
                    : undefined
                }
              />
            </div>
          </div>
        )

      case 8:
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold">Revisão Final</h3>
                <p className="text-xs text-muted-foreground">Confirme todos os dados antes de enviar</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Basic info */}
              <ReviewSection title="Dados Básicos">
                <ReviewRow label="Taxista" value={formData.taxista} />
                <ReviewRow label="Data" value={formData.data} />
                <ReviewRow label="Placa" value={formData.placa} />
                <ReviewRow label="Tipo" value={formData.tipo_viagem} />
              </ReviewSection>

              <ReviewSection title="Locais">
                <ReviewRow label="Origem" value={formData.inicio_base} />
                <ReviewRow label="Destino" value={formData.final_base} />
                <ReviewRow label="Embarque" value={formData.embarque_empregado} />
                <ReviewRow label="Desembarque" value={formData.desembarque_empregado} />
              </ReviewSection>

              <ReviewSection title="Passageiros">
                {formData.passengers.map((p, i) => (
                  <ReviewRow
                    key={i}
                    label={`Passageiro ${i + 1}`}
                    value={p.nome + (p.matricula ? ` (${p.matricula})` : '')}
                  />
                ))}
              </ReviewSection>

              <ReviewSection title="Setor e Justificativa">
                <ReviewRow label="Setor" value={formData.setor} />
                <div className="space-y-1">
                  <span className="label-text">Justificativa</span>
                  <p className="text-sm text-foreground bg-muted/30 p-3 rounded-lg">{formData.justificativa}</p>
                </div>
              </ReviewSection>

              {/* Photos preview */}
              {(photoKmInicial.previewUrl || photoKmFinal.previewUrl) && (
                <ReviewSection title="Fotos">
                  <div className="grid grid-cols-2 gap-3">
                    {photoKmInicial.previewUrl && (
                      <div>
                        <p className="label-text mb-1">KM Inicial</p>
                        <img src={photoKmInicial.previewUrl} className="w-full h-24 object-cover rounded-lg" />
                      </div>
                    )}
                    {photoKmFinal.previewUrl && (
                      <div>
                        <p className="label-text mb-1">KM Final</p>
                        <img src={photoKmFinal.previewUrl} className="w-full h-24 object-cover rounded-lg" />
                      </div>
                    )}
                  </div>
                </ReviewSection>
              )}

              <ReviewSection title="Horários e KM">
                <ReviewRow label="Hora Inicial" value={formData.hora_inicial} />
                <ReviewRow label="Hora Final" value={formData.hora_final} />
                {formData.hora_parada && <ReviewRow label="Hora Parada" value={formData.hora_parada} />}
                <ReviewRow label="KM Inicial" value={formData.km_inicial} />
                <ReviewRow label="KM Final" value={formData.km_final} />
                <ReviewRow label="Total KM" value={totalKm ? `${totalKm} km` : '-'} highlight />
              </ReviewSection>

              {/* Signatures preview */}
              {(sigPassageiro.dataUrl || sigMotorista.dataUrl) && (
                <ReviewSection title="Assinaturas">
                  <div className="grid grid-cols-2 gap-3">
                    {sigPassageiro.dataUrl && (
                      <div>
                        <p className="label-text mb-1">
                          Passageiro
                          {sigPassageiro.method && (
                            <span className="ml-1 text-[10px] text-primary">
                              ({sigPassageiro.method === 'typed' ? 'Digitada' : 'Desenhada'})
                            </span>
                          )}
                        </p>
                        <img src={sigPassageiro.dataUrl} className="w-full h-16 object-contain bg-white/5 rounded-lg p-1" />
                        {sigPassageiro.signerName && (
                          <p className="text-[10px] text-muted-foreground mt-1 truncate">{sigPassageiro.signerName}</p>
                        )}
                      </div>
                    )}
                    {sigMotorista.dataUrl && (
                      <div>
                        <p className="label-text mb-1">
                          Motorista
                          {sigMotorista.method && (
                            <span className="ml-1 text-[10px] text-primary">
                              ({sigMotorista.method === 'profile' ? 'Auto' : sigMotorista.method === 'typed' ? 'Digitada' : 'Desenhada'})
                            </span>
                          )}
                        </p>
                        <img src={sigMotorista.dataUrl} className="w-full h-16 object-contain bg-white/5 rounded-lg p-1" />
                        {sigMotorista.signerName && (
                          <p className="text-[10px] text-muted-foreground mt-1 truncate">{sigMotorista.signerName}</p>
                        )}
                      </div>
                    )}
                  </div>
                </ReviewSection>
              )}

              {/* Value locked */}
              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-3">
                <Lock className="h-5 w-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-400">Valor Total</p>
                  <p className="text-xs text-muted-foreground">Aguardando cálculo da central após envio</p>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Nova Viagem"
        description="Preencha todas as etapas para registrar a viagem"
      />

      {!isOnline && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs">
          <WifiOff className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Você está sem conexão</p>
            <p className="text-amber-400/70 mt-0.5">
              Pode preencher e salvar normalmente. Tudo é guardado neste aparelho e enviado
              automaticamente para a central assim que a internet voltar.
            </p>
          </div>
        </div>
      )}

      {pendingTrips.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center gap-2">
            <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Viagens pendentes de sincronização ({pendingTrips.length})
            </p>
          </div>
          <div className="p-3 space-y-2">
            {pendingTrips.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-secondary/40 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{item.protocolo}</p>
                  <p className="text-muted-foreground">
                    {item.isDraft ? 'Rascunho' : 'Envio para a central'}
                  </p>
                </div>
                <PendingStatusChip status={item.status} onRetry={() => retrySync(item.id)} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card p-6">
        <TripStepper steps={STEPS} currentStep={step} completedSteps={completedSteps} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {stepErrors[step] && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive"
          >
            {stepErrors[step]}
          </motion.div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={step === 0 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>

          <div className="flex gap-2">
            {step === STEPS.length - 1 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(true)}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar Rascunho
                </Button>
                <Button
                  variant="success"
                  size="lg"
                  onClick={() => handleSubmit(false)}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar para Central
                </Button>
              </>
            ) : (
              <Button onClick={nextStep} disabled={loading}>
                Próximo
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-4 space-y-2.5">{children}</div>
    </div>
  )
}

function ReviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className={cn('text-sm text-right', highlight ? 'font-bold text-primary' : 'text-foreground')}>
        {value || '-'}
      </span>
    </div>
  )
}

function PendingStatusChip({
  status, onRetry,
}: { status: 'queued' | 'syncing' | 'synced' | 'error'; onRetry: () => void }) {
  switch (status) {
    case 'syncing':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium flex-shrink-0">
          <Loader2 className="h-3 w-3 animate-spin" />
          Sincronizando...
        </span>
      )
    case 'error':
      return (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 font-medium flex-shrink-0 hover:bg-red-500/25 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Erro — tentar novamente
        </button>
      )
    case 'synced':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium flex-shrink-0">
          Enviado para a central
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium flex-shrink-0">
          <CloudOff className="h-3 w-3" />
          Pendente de sincronização
        </span>
      )
  }
}
