export type AppRole = 'motorista' | 'supervisor' | 'admin'

export type TripStatus = 'rascunho' | 'enviado' | 'pendente' | 'aprovado' | 'recusado' | 'correcao'

export type TripType = 'municipal' | 'intermunicipal'

export type PhotoType = 'km_inicial' | 'km_final'

export type SignatureType = 'motorista' | 'passageiro'

export type ApprovalAction = 'aprovado' | 'recusado' | 'correcao'

export const SETORES = [
  'RH',
  'Apoio Administrativo',
  'Serviços Técnicos',
  'Almoxarifado',
  'Meio Ambiente',
  'Medicina',
  'Segurança do Trabalho',
  'Controladoria',
  'Laboratório',
  'Mina',
  'Logística',
  'Sala de Monitoramento',
  'Operação de Usina',
  'Manutenção',
  'ECI',
  'Relações com Comunidade',
  'Comunicação',
] as const

export type Setor = (typeof SETORES)[number]

export const BASES = [
  'Base Central',
  'Base Norte',
  'Base Sul',
  'Base Leste',
  'Base Mina',
  'Base Usina',
  'Base Escritório',
] as const

export type Base = (typeof BASES)[number]
