import type { TripStatus, TripType, PhotoType, SignatureType } from './enums'

export interface Passenger {
  id: string
  trip_id: string
  nome: string
  matricula?: string
  created_at: string
}

export interface Photo {
  id: string
  trip_id: string
  tipo: PhotoType
  storage_path: string
  original_storage_path?: string
  stamped_storage_path?: string
  uploaded_by: string
  taken_at: string
  captured_at?: string
  created_at: string
  latitude?: number
  longitude?: number
  address?: string
  location_accuracy?: number
  location_denied?: boolean
  device_timezone?: string
  url?: string
}

export interface Signature {
  id: string
  trip_id: string
  tipo: SignatureType
  storage_path: string
  signer_name: string
  signed_at: string
  created_at: string
  url?: string
}

export interface Approval {
  id: string
  trip_id: string
  action: 'aprovado' | 'recusado' | 'correcao'
  by_user: string
  motivo?: string
  created_at: string
  approver_name?: string
}

export interface Trip {
  id: string
  driver_id: string
  protocolo: string
  status: TripStatus
  data: string
  placa: string
  base: string
  tipo_viagem: TripType
  hora_inicial: string
  hora_final: string
  hora_parada?: string
  km_inicial: number
  km_final: number
  total_km?: number
  inicio_base: string
  final_base: string
  embarque_empregado: string
  desembarque_empregado: string
  descricao_viagem: string
  justificativa: string
  setor: string
  valor_total?: number
  valor_definido_por?: string
  valor_definido_em?: string
  motivo_recusa?: string
  motivo_correcao?: string
  pdf_path?: string
  pdf_generated_at?: string
  sent_at?: string
  approved_at?: string
  approved_by?: string
  created_at: string
  updated_at: string
  driver_name?: string
  passengers?: Passenger[]
  photos?: Photo[]
  signatures?: Signature[]
  approvals?: Approval[]
}

export interface TripFormData {
  taxista: string
  data: string
  placa: string
  base: string
  tipo_viagem: TripType
  hora_inicial: string
  hora_final: string
  hora_parada?: string
  km_inicial: number | string
  km_final: number | string
  inicio_base: string
  final_base: string
  embarque_empregado: string
  desembarque_empregado: string
  descricao_viagem: string
  justificativa: string
  setor: string
  passengers: { nome: string; matricula?: string }[]
}

export interface AuditLog {
  id: string
  entity: string
  entity_id: string
  action: string
  by_user: string
  diff?: Record<string, unknown>
  created_at: string
  user_name?: string
}
