import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  deletePendingTrip,
  enqueuePendingTrip,
  listPendingTrips,
  updatePendingTripStatus,
  promoteDraftToSubmission,
  type PendingTripPayload,
  type PendingTripRecord,
} from '@/lib/offlineTrips'
import { submitTripToServer } from '@/lib/tripSubmission'

// Sincroniza viagens salvas localmente (rascunho ou envio) assim que a
// conexão volta — fila offline-first para o fluxo do motorista.

export function useTripSync(driverId: string | undefined, profileBase?: string | null) {
  const [pendingTrips, setPendingTrips] = useState<PendingTripRecord[]>([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const syncing = useRef(false)

  const refresh = useCallback(async () => {
    if (!driverId) { setPendingTrips([]); return }
    const items = await listPendingTrips(driverId)
    items.sort((a, b) => a.createdAt - b.createdAt)
    setPendingTrips(items)
  }, [driverId])

  const syncPendingTrips = useCallback(async () => {
    if (!driverId || syncing.current || !navigator.onLine) return
    syncing.current = true
    try {
      const items = await listPendingTrips(driverId)
      for (const item of items) {
        if (item.status === 'synced' || item.status === 'syncing') continue
        if (!navigator.onLine) break

        await updatePendingTripStatus(item.id, 'syncing')
        await refresh()
        try {
          await submitTripToServer({
            tripId: item.id,
            userId: item.driverId,
            protocolo: item.protocolo,
            isDraft: item.isDraft,
            formData: item.payload.formData as never,
            totalKm: item.payload.totalKm,
            profileBase,
            photoKmInicial: item.payload.photoKmInicial,
            photoKmFinal: item.payload.photoKmFinal,
            sigPassageiro: item.payload.sigPassageiro,
            sigMotorista: item.payload.sigMotorista,
          })
          await deletePendingTrip(item.id)
          toast.success(
            item.isDraft
              ? `Rascunho sincronizado! Protocolo ${item.protocolo}`
              : `Viagem enviada para a central! Protocolo ${item.protocolo}`,
          )
        } catch (err) {
          console.error('[useTripSync] Falha ao sincronizar viagem pendente:', err)
          await updatePendingTripStatus(item.id, 'error', 'Erro ao sincronizar. Tentaremos novamente.')
        }
        await refresh()
      }
    } finally {
      syncing.current = false
    }
  }, [driverId, profileBase, refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      syncPendingTrips()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (navigator.onLine) syncPendingTrips()

    // Tentativa periódica — cobre o caso em que o navegador não dispara o
    // evento 'online' de forma confiável (comum em PWA/Android).
    const interval = setInterval(() => {
      if (navigator.onLine) syncPendingTrips()
    }, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [syncPendingTrips])

  const queueTrip = useCallback(async (record: {
    id: string
    protocolo: string
    isDraft: boolean
    payload: PendingTripPayload
  }) => {
    if (!driverId) throw new Error('Usuário não identificado')
    const now = Date.now()
    await enqueuePendingTrip({
      id: record.id,
      driverId,
      protocolo: record.protocolo,
      isDraft: record.isDraft,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      payload: record.payload,
    })
    await refresh()
    syncPendingTrips()
  }, [driverId, refresh, syncPendingTrips])

  const retry = useCallback(async (id: string) => {
    await updatePendingTripStatus(id, 'queued')
    await refresh()
    syncPendingTrips()
  }, [refresh, syncPendingTrips])

  const submitDraft = useCallback(async (id: string) => {
    await promoteDraftToSubmission(id)
    await refresh()
    syncPendingTrips()
  }, [refresh, syncPendingTrips])

  return { pendingTrips, isOnline, queueTrip, retry, submitDraft, syncNow: syncPendingTrips }
}
