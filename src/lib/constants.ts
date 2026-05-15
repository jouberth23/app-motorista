export const APP_NAME = 'TaxiVoucher'
export const APP_VERSION = '1.0.0'
export const COMPANY_NAME = 'Empresa Industrial S/A'

export const STATUS_LABELS = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  pendente: 'Em Análise',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  correcao: 'Correção Solicitada',
} as const

export const STATUS_COLORS = {
  rascunho: 'status-draft',
  enviado: 'status-sent',
  pendente: 'status-pending',
  aprovado: 'status-approved',
  recusado: 'status-rejected',
  correcao: 'status-correction',
} as const

export const ROLE_LABELS = {
  motorista: 'Motorista',
  supervisor: 'Supervisor / Central',
  admin: 'Administrador',
} as const

export const TRIP_TYPE_LABELS = {
  municipal: 'Municipal',
  intermunicipal: 'Intermunicipal',
} as const

export const MAX_PASSENGERS = 10
export const MAX_PHOTO_SIZE_MB = 10
