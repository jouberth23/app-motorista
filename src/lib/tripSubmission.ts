import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import type { TripType } from '@/types/enums'

// Lógica de envio de viagem para o Supabase, compartilhada entre o envio
// imediato (online) e a sincronização da fila offline. Idempotente: pode
// ser chamada mais de uma vez para o mesmo tripId sem duplicar dados —
// necessário porque uma sincronização pode ser interrompida no meio e
// tentada novamente.

interface SubmitFormData {
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

interface SubmitPhoto {
  originalFile?: File | Blob
  stampedFile?: File | Blob
  capturedAt?: string
  latitude?: number
  longitude?: number
  accuracy?: number
  address?: string
  locationDenied?: boolean
}

interface SubmitSignature {
  dataUrl: string
  signerName?: string
  method?: string
  signedAt?: string
}

export interface TripSubmissionInput {
  tripId: string
  userId: string
  protocolo: string
  isDraft: boolean
  formData: SubmitFormData
  totalKm: number | null
  profileBase?: string | null
  photoKmInicial?: SubmitPhoto
  photoKmFinal?: SubmitPhoto
  sigPassageiro?: SubmitSignature
  sigMotorista?: SubmitSignature
}

function toFile(blob: File | Blob, name: string): File {
  if (blob instanceof File) return blob
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}

async function uploadPhotoFile(file: File, path: string): Promise<void> {
  const { error } = await supabase.storage.from('trip-photos').upload(path, file, { upsert: true })
  if (error) throw error
}

async function uploadDataUrl(dataUrl: string, path: string): Promise<string> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const file = new File([blob], path.split('/').pop()!, { type: blob.type })
  const { error } = await supabase.storage.from('signatures').upload(path, file, { upsert: true })
  if (error) throw error
  return path
}

async function submitPhoto(
  photo: SubmitPhoto | undefined,
  tipo: 'km_inicial' | 'km_final',
  tripId: string,
  userId: string,
): Promise<void> {
  if (!photo || (!photo.originalFile && !photo.stampedFile)) return

  // Idempotência: se já existe um registro para este trip+tipo, assumimos
  // que uma tentativa anterior já enviou esta foto — não duplicar.
  const { data: existing } = await supabase
    .from('photos')
    .select('id')
    .eq('trip_id', tripId)
    .eq('tipo', tipo)
    .maybeSingle()
  if (existing) return

  const ts = Date.now()
  const originalPath = photo.originalFile ? `${tripId}/${tipo}_original_${ts}.jpg` : undefined
  const stampedPath = photo.stampedFile ? `${tripId}/${tipo}_stamped_${ts}.jpg` : undefined

  if (originalPath && photo.originalFile) {
    await uploadPhotoFile(toFile(photo.originalFile, `${tipo}_original.jpg`), originalPath)
  }
  if (stampedPath && photo.stampedFile) {
    await uploadPhotoFile(toFile(photo.stampedFile, `${tipo}_stamped.jpg`), stampedPath)
  }

  const primaryPath = stampedPath ?? originalPath ?? ''

  let photoId: string | undefined
  const { data: fullData, error: fullError } = await supabase
    .from('photos')
    .insert({
      trip_id: tripId,
      tipo,
      storage_path: primaryPath,
      original_storage_path: originalPath ?? null,
      stamped_storage_path: stampedPath ?? null,
      uploaded_by: userId,
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

  if (fullError) {
    const { data: baseData, error: baseError } = await supabase
      .from('photos')
      .insert({
        trip_id: tripId,
        tipo,
        storage_path: primaryPath,
        uploaded_by: userId,
        taken_at: photo.capturedAt ?? new Date().toISOString(),
      })
      .select('id')
      .single()
    if (baseError) throw baseError
    photoId = baseData?.id
  } else {
    photoId = fullData?.id
  }

  if (photoId) {
    const action = tipo === 'km_inicial' ? 'photo_km_initial_uploaded' : 'photo_km_final_uploaded'
    await logAudit({
      entity: 'photos',
      entity_id: photoId,
      action,
      by_user: userId,
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

async function submitSignature(
  sig: SubmitSignature | undefined,
  tipo: 'passageiro' | 'motorista',
  tripId: string,
  defaultName: string,
): Promise<void> {
  if (!sig?.dataUrl) return

  const { data: existing } = await supabase
    .from('signatures')
    .select('id')
    .eq('trip_id', tripId)
    .eq('tipo', tipo)
    .maybeSingle()
  if (existing) return

  const path = `${tripId}/sig_${tipo}_${Date.now()}.png`
  const storagePath = await uploadDataUrl(sig.dataUrl, path)
  await supabase.from('signatures').insert({
    trip_id: tripId,
    tipo,
    storage_path: storagePath,
    signer_name: sig.signerName ?? defaultName,
    signed_at: sig.signedAt ?? new Date().toISOString(),
  })
}

export async function submitTripToServer(input: TripSubmissionInput): Promise<void> {
  const {
    tripId, userId, protocolo, isDraft, formData, totalKm, profileBase,
    photoKmInicial, photoKmFinal, sigPassageiro, sigMotorista,
  } = input

  // upsert por id: se uma tentativa anterior já criou a viagem (ex.: a conexão
  // caiu antes da resposta chegar), isto apenas atualiza em vez de duplicar.
  const { error: tripError } = await supabase.from('trips').upsert({
    id: tripId,
    driver_id: userId,
    protocolo,
    status: isDraft ? 'rascunho' : 'enviado',
    data: formData.data,
    placa: formData.placa.toUpperCase(),
    base: formData.base || profileBase || 'Não informada',
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
    descricao_viagem: formData.justificativa,
    justificativa: formData.justificativa,
    setor: formData.setor,
    sent_at: isDraft ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  if (tripError) throw tripError

  // Idempotência dos passageiros: substitui a lista inteira a cada tentativa.
  const validPassengers = formData.passengers.filter((p) => p.nome.trim())
  await supabase.from('passengers').delete().eq('trip_id', tripId)
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

  await submitPhoto(photoKmInicial, 'km_inicial', tripId, userId)
  await submitPhoto(photoKmFinal, 'km_final', tripId, userId)

  await submitSignature(sigPassageiro, 'passageiro', tripId, formData.passengers[0]?.nome ?? 'Passageiro')
  await submitSignature(sigMotorista, 'motorista', tripId, formData.taxista)
}
