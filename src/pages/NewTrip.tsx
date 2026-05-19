import { useState } from 'react'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TripStepper } from '@/components/trips/TripStepper'
import { PhotoCapture } from '@/components/trips/PhotoCapture'
import type { PhotoCaptureResult } from '@/components/trips/PhotoCapture'
import { SignaturePad } from '@/components/trips/SignaturePad'
import type { SignatureResult } from '@/components/trips/SignaturePad'
import { PageHeader } from '@/components/common/PageHeader'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { toast } from 'sonner'
import { SETORES, BASES } from '@/types/enums'
import { generateProtocol } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { TripType } from '@/types/enums'

const STEPS = [
  { label: 'Dados Básicos', description: 'Taxista, data, placa' },
  { label: 'Horários & KM', description: 'Tempos e quilometragem' },
  { label: 'Locais', description: 'Origem e destino' },
  { label: 'Passageiros', description: 'Lista de passageiros' },
  { label: 'Setor', description: 'Departamento' },
  { label: 'Justificativa', description: 'Motivo da viagem' },
  { label: 'Fotos', description: 'Registro obrigatório' },
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
  descricao_viagem: string
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
    descricao_viagem: '',
    justificativa: '',
    setor: '',
    passengers: [{ nome: '', matricula: '' }],
  })

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
        if (!formData.base) return 'Base obrigatória'
        if (!formData.tipo_viagem) return 'Tipo de viagem obrigatório'
        return null
      case 1:
        if (!formData.hora_inicial) return 'Hora inicial obrigatória'
        if (!formData.hora_final) return 'Hora final obrigatória'
        if (!formData.km_inicial) return 'KM inicial obrigatório'
        if (!formData.km_final) return 'KM final obrigatório'
        if (parseFloat(formData.km_final) < parseFloat(formData.km_inicial))
          return 'KM final não pode ser menor que KM inicial'
        return null
      case 2:
        if (!formData.inicio_base.trim()) return 'Local de início obrigatório'
        if (!formData.final_base.trim()) return 'Local final obrigatório'
        if (!formData.embarque_empregado.trim()) return 'Local de embarque obrigatório'
        if (!formData.desembarque_empregado.trim()) return 'Local de desembarque obrigatório'
        if (!formData.descricao_viagem.trim()) return 'Descrição obrigatória'
        return null
      case 3:
        if (formData.passengers.some((p) => !p.nome.trim())) return 'Todos os passageiros devem ter nome'
        if (formData.passengers.length === 0) return 'Pelo menos um passageiro é obrigatório'
        return null
      case 4:
        if (!formData.setor) return 'Setor obrigatório'
        return null
      case 5:
        if (formData.justificativa.trim().length < 10) return 'Justificativa deve ter pelo menos 10 caracteres'
        return null
      case 6:
        if (!photoKmInicial.previewUrl && !photoKmInicial.originalFile) return 'Foto da quilometragem inicial é obrigatória'
        if (!photoKmFinal.previewUrl && !photoKmFinal.originalFile) return 'Foto da quilometragem final é obrigatória'
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

  const uploadBase64 = async (dataUrl: string, path: string): Promise<string> => {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const file = new File([blob], path.split('/').pop()!, { type: blob.type })
    const { error } = await supabase.storage.from('signatures').upload(path, file, { upsert: true })
    if (error) throw error
    return path
  }

  const uploadPhotoFile = async (file: File, path: string): Promise<void> => {
    const { error } = await supabase.storage.from('trip-photos').upload(path, file, { upsert: true })
    if (error) throw error
  }

  const uploadPhotoWithStamp = async (
    photo: PhotoState,
    tipo: 'km_inicial' | 'km_final',
    tripId: string,
  ): Promise<void> => {
    if (!user) return
    const ts = Date.now()

    const originalPath = photo.originalFile
      ? `${tripId}/${tipo}_original_${ts}.jpg`
      : undefined
    const stampedPath = photo.stampedFile
      ? `${tripId}/${tipo}_stamped_${ts}.jpg`
      : undefined

    if (originalPath && photo.originalFile) {
      await uploadPhotoFile(photo.originalFile, originalPath)
    }
    if (stampedPath && photo.stampedFile) {
      await uploadPhotoFile(photo.stampedFile, stampedPath)
    }

    // storage_path → stamped (primary display); fallback to original
    const primaryPath = stampedPath ?? originalPath ?? ''

    const { data: inserted, error: photoInsertError } = await supabase
      .from('photos')
      .insert({
        trip_id: tripId,
        tipo,
        storage_path: primaryPath,
        original_storage_path: originalPath ?? null,
        stamped_storage_path: stampedPath ?? null,
        uploaded_by: user.id,
        taken_at: photo.capturedAt ?? new Date().toISOString(),
        captured_at: photo.capturedAt ?? new Date().toISOString(),
        latitude: photo.latitude ?? null,
        longitude: photo.longitude ?? null,
        address: photo.address ?? null,
        location_accuracy: photo.accuracy ?? null,
        location_denied: photo.locationDenied ?? false,
        device_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .select('id')
      .single()

    if (photoInsertError) throw photoInsertError
    const photoId = inserted?.id
    if (photoId) {
      const action = tipo === 'km_inicial'
        ? 'photo_km_initial_uploaded'
        : 'photo_km_final_uploaded'
      await logAudit({
        entity: 'photos',
        entity_id: photoId,
        action,
        by_user: user.id,
        diff: {
          latitude: photo.latitude ?? null,
          longitude: photo.longitude ?? null,
          address: photo.address ?? null,
          accuracy: photo.accuracy ?? null,
          captured_at: photo.capturedAt ?? null,
          has_location: !!photo.latitude,
          stamped: !!stampedPath,
          location_denied: photo.locationDenied ?? false,
        },
      })
    }
  }

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
    try {
      const tripId = crypto.randomUUID()

      const { error: tripError } = await supabase.from('trips').insert({
        id: tripId,
        driver_id: user.id,
        protocolo,
        status: isDraft ? 'rascunho' : 'enviado',
        data: formData.data,
        placa: formData.placa.toUpperCase(),
        base: formData.base,
        tipo_viagem: formData.tipo_viagem,
        hora_inicial: formData.hora_inicial,
        hora_final: formData.hora_final,
        hora_parada: formData.hora_parada || null,
        km_inicial: parseFloat(formData.km_inicial),
        km_final: parseFloat(formData.km_final),
        total_km: totalKm,
        inicio_base: formData.inicio_base,
        final_base: formData.final_base,
        embarque_empregado: formData.embarque_empregado,
        desembarque_empregado: formData.desembarque_empregado,
        descricao_viagem: formData.descricao_viagem,
        justificativa: formData.justificativa,
        setor: formData.setor,
        sent_at: isDraft ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (tripError) throw tripError

      // Insert passengers
      const validPassengers = formData.passengers.filter((p) => p.nome.trim())
      if (validPassengers.length > 0) {
        const { error: passengerError } = await supabase.from('passengers').insert(
          validPassengers.map((p) => ({
            trip_id: tripId,
            nome: p.nome,
            matricula: p.matricula || null,
          })),
        )
        if (passengerError) throw passengerError
      }

      // Upload photos (original + stamped versions with location metadata)
      if (photoKmInicial.originalFile || photoKmInicial.stampedFile) {
        await uploadPhotoWithStamp(photoKmInicial, 'km_inicial', tripId)
      }

      if (photoKmFinal.originalFile || photoKmFinal.stampedFile) {
        await uploadPhotoWithStamp(photoKmFinal, 'km_final', tripId)
      }

      // Upload signatures
      if (sigPassageiro.dataUrl) {
        const path = `${tripId}/sig_passageiro_${Date.now()}.png`
        const storagePath = await uploadBase64(sigPassageiro.dataUrl, path)
        await supabase.from('signatures').insert({
          trip_id: tripId,
          tipo: 'passageiro',
          storage_path: storagePath,
          signer_name: sigPassageiro.signerName ?? formData.passengers[0]?.nome ?? 'Passageiro',
          signed_at: sigPassageiro.signedAt ?? new Date().toISOString(),
        })
      }

      if (sigMotorista.dataUrl) {
        const path = `${tripId}/sig_motorista_${Date.now()}.png`
        const storagePath = await uploadBase64(sigMotorista.dataUrl, path)
        await supabase.from('signatures').insert({
          trip_id: tripId,
          tipo: 'motorista',
          storage_path: storagePath,
          signer_name: sigMotorista.signerName ?? formData.taxista,
          signed_at: sigMotorista.signedAt ?? new Date().toISOString(),
        })
      }

      toast.success(
        isDraft ? 'Rascunho salvo com sucesso!' : `Viagem enviada! Protocolo: ${protocolo}`,
      )
      navigate('/trips')
    } catch (err) {
      console.error(err)
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
                <Label>Base *</Label>
                <Select value={formData.base} onValueChange={(v) => updateField('base', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a base" />
                  </SelectTrigger>
                  <SelectContent>
                    {BASES.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

      case 1:
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

      case 2:
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
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Descrição da Viagem *</Label>
                <Textarea
                  value={formData.descricao_viagem}
                  onChange={(e) => updateField('descricao_viagem', e.target.value)}
                  placeholder="Descreva brevemente o objetivo da viagem..."
                  rows={3}
                />
              </div>
            </div>
          </div>
        )

      case 3:
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

      case 4:
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

      case 5:
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

      case 6:
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
              error={stepErrors[6] && !photoKmInicial.previewUrl ? 'Foto obrigatória' : undefined}
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
                stepErrors[6] && !photoKmFinal.previewUrl && photoKmInicial.previewUrl
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
                <ReviewRow label="Base" value={formData.base} />
                <ReviewRow label="Tipo" value={formData.tipo_viagem} />
              </ReviewSection>

              <ReviewSection title="Horários e KM">
                <ReviewRow label="Hora Inicial" value={formData.hora_inicial} />
                <ReviewRow label="Hora Final" value={formData.hora_final} />
                {formData.hora_parada && <ReviewRow label="Hora Parada" value={formData.hora_parada} />}
                <ReviewRow label="KM Inicial" value={formData.km_inicial} />
                <ReviewRow label="KM Final" value={formData.km_final} />
                <ReviewRow label="Total KM" value={totalKm ? `${totalKm} km` : '-'} highlight />
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
