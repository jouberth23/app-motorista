import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          nome: string
          telefone: string | null
          base: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
      }
      trips: {
        Row: {
          id: string
          driver_id: string
          protocolo: string
          status: string
          data: string
          placa: string
          base: string
          tipo_viagem: string
          hora_inicial: string
          hora_final: string
          hora_parada: string | null
          km_inicial: number
          km_final: number
          total_km: number | null
          inicio_base: string
          final_base: string
          embarque_empregado: string
          desembarque_empregado: string
          descricao_viagem: string
          justificativa: string
          setor: string
          valor_total: number | null
          valor_definido_por: string | null
          valor_definido_em: string | null
          motivo_recusa: string | null
          sent_at: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          updated_at: string
        }
      }
    }
  }
}
