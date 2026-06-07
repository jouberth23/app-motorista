import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import type { Trip } from '@/types/trip'
import type { TripStatus } from '@/types/enums'
import { toast } from 'sonner'

export function useTrips(driverId?: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTrips = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('trips')
        .select(`
          *,
          passengers(*),
          photos(*),
          signatures(*),
          approvals(*)
        `)
        .order('created_at', { ascending: false })

      if (driverId) {
        query = query.eq('driver_id', driverId)
      }

      const { data, error } = await query
      if (error) throw error
      setTrips((data as Trip[]) ?? [])
    } catch (err) {
      console.error('Error fetching trips:', err)
    } finally {
      setLoading(false)
    }
  }, [driverId])

  // Limpa os dados imediatamente ao trocar de driver/usuário, para nunca exibir
  // viagens de outra conta enquanto a nova consulta ainda não retornou
  useEffect(() => {
    setTrips([])
    setLoading(true)
  }, [driverId])

  useEffect(() => {
    if (enabled) fetchTrips()
  }, [fetchTrips, enabled])

  return { trips, loading: enabled ? loading : true, refetch: fetchTrips }
}

export function useTripsByStatus(status?: TripStatus) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTrips = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('trips')
        .select(`*, passengers(*), photos(*), signatures(*), approvals(*)`)
        .order('created_at', { ascending: false })

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query
      if (error) throw error
      setTrips((data as Trip[]) ?? [])
    } catch (err) {
      console.error('Error fetching trips:', err)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    fetchTrips()
  }, [fetchTrips])

  return { trips, loading, refetch: fetchTrips }
}

export function useTripActions() {
  const submitTrip = async (tripId: string, submittedBy?: string) => {
    const { error } = await supabase
      .from('trips')
      .update({ status: 'enviado', sent_at: new Date().toISOString() })
      .eq('id', tripId)

    if (error) {
      toast.error('Erro ao enviar viagem')
      throw error
    }

    if (submittedBy) {
      await logAudit({
        entity: 'trips',
        entity_id: tripId,
        action: 'SEND',
        by_user: submittedBy,
      })
    }

    toast.success('Viagem enviada para a central!')
  }

  const approveTrip = async (tripId: string, valorTotal: number, approvedBy: string) => {
    const { error } = await supabase
      .from('trips')
      .update({
        status: 'aprovado',
        valor_total: valorTotal,
        valor_definido_por: approvedBy,
        valor_definido_em: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        approved_by: approvedBy,
      })
      .eq('id', tripId)

    if (error) {
      toast.error('Erro ao aprovar viagem')
      throw error
    }

    await supabase.from('approvals').insert({
      trip_id: tripId,
      action: 'aprovado',
      by_user: approvedBy,
    })

    await logAudit({
      entity: 'trips',
      entity_id: tripId,
      action: 'APPROVE',
      by_user: approvedBy,
      diff: { valor_total: valorTotal },
    })

    toast.success('Viagem aprovada com sucesso!')
  }

  const rejectTrip = async (tripId: string, motivo: string, rejectedBy: string) => {
    const { error } = await supabase
      .from('trips')
      .update({ status: 'recusado', motivo_recusa: motivo })
      .eq('id', tripId)

    if (error) {
      toast.error('Erro ao recusar viagem')
      throw error
    }

    await supabase.from('approvals').insert({
      trip_id: tripId,
      action: 'recusado',
      by_user: rejectedBy,
      motivo,
    })

    await logAudit({
      entity: 'trips',
      entity_id: tripId,
      action: 'REJECT',
      by_user: rejectedBy,
      diff: { motivo },
    })

    toast.success('Viagem recusada.')
  }

  const requestCorrection = async (tripId: string, motivo: string, requestedBy: string) => {
    const { error } = await supabase
      .from('trips')
      .update({ status: 'correcao', motivo_correcao: motivo })
      .eq('id', tripId)

    if (error) {
      toast.error('Erro ao solicitar correção')
      throw error
    }

    await supabase.from('approvals').insert({
      trip_id: tripId,
      action: 'correcao',
      by_user: requestedBy,
      motivo,
    })

    await logAudit({
      entity: 'trips',
      entity_id: tripId,
      action: 'CORRECAO_SOLICITADA',
      by_user: requestedBy,
      diff: { motivo },
    })

    toast.success('Correção solicitada ao motorista.')
  }

  const updateAndResubmitTrip = async (
    tripId: string,
    updates: {
      data?: string
      placa?: string
      base?: string
      tipo_viagem?: string
      hora_inicial?: string
      hora_final?: string
      hora_parada?: string | null
      km_inicial?: number
      km_final?: number
      total_km?: number
      inicio_base?: string
      final_base?: string
      embarque_empregado?: string
      desembarque_empregado?: string
      descricao_viagem?: string
      justificativa?: string
      setor?: string
    },
    passengers: { nome: string; matricula?: string }[],
    submittedBy: string,
  ) => {
    const { error } = await supabase
      .from('trips')
      .update({ ...updates, status: 'enviado', sent_at: new Date().toISOString() })
      .eq('id', tripId)

    if (error) {
      toast.error('Erro ao salvar correção')
      throw error
    }

    await supabase.from('passengers').delete().eq('trip_id', tripId)
    if (passengers.length > 0) {
      await supabase.from('passengers').insert(
        passengers.map((p) => ({
          trip_id: tripId,
          nome: p.nome,
          matricula: p.matricula || null,
        })),
      )
    }

    await logAudit({
      entity: 'trips',
      entity_id: tripId,
      action: 'CORRECAO_ENVIADA',
      by_user: submittedBy,
      diff: updates as Record<string, unknown>,
    })

    toast.success('Correção enviada para a central!')
  }

  return { submitTrip, approveTrip, rejectTrip, requestCorrection, updateAndResubmitTrip }
}
