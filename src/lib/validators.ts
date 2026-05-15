import { z } from 'zod'

export const passengerSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  matricula: z.string().optional(),
})

export const tripStep1Schema = z.object({
  taxista: z.string().min(2, 'Nome do taxista obrigatório'),
  data: z.string().min(1, 'Data obrigatória'),
  placa: z
    .string()
    .min(7, 'Placa inválida')
    .regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$|^[A-Z]{3}[0-9]{4}$/i, 'Formato de placa inválido'),
  base: z.string().min(1, 'Base obrigatória'),
  tipo_viagem: z.enum(['municipal', 'intermunicipal'], {
    required_error: 'Tipo de viagem obrigatório',
  }),
})

export const tripStep2Schema = z
  .object({
    hora_inicial: z.string().min(1, 'Hora inicial obrigatória'),
    hora_final: z.string().min(1, 'Hora final obrigatória'),
    hora_parada: z.string().optional(),
    km_inicial: z
      .number({ invalid_type_error: 'KM inicial obrigatório' })
      .min(0, 'KM não pode ser negativo'),
    km_final: z
      .number({ invalid_type_error: 'KM final obrigatório' })
      .min(0, 'KM não pode ser negativo'),
  })
  .refine((data) => data.km_final >= data.km_inicial, {
    message: 'KM final não pode ser menor que KM inicial',
    path: ['km_final'],
  })

export const tripStep3Schema = z.object({
  inicio_base: z.string().min(2, 'Local de início obrigatório'),
  final_base: z.string().min(2, 'Local final obrigatório'),
  embarque_empregado: z.string().min(2, 'Local de embarque obrigatório'),
  desembarque_empregado: z.string().min(2, 'Local de desembarque obrigatório'),
  descricao_viagem: z.string().min(5, 'Descrição obrigatória'),
})

export const tripStep4Schema = z.object({
  passengers: z
    .array(passengerSchema)
    .min(1, 'Pelo menos um passageiro é obrigatório')
    .max(10, 'Máximo de 10 passageiros'),
})

export const tripStep5Schema = z.object({
  setor: z.string().min(1, 'Setor obrigatório'),
})

export const tripStep6Schema = z.object({
  justificativa: z
    .string()
    .min(10, 'Justificativa deve ter pelo menos 10 caracteres')
    .max(500, 'Justificativa muito longa'),
})

export const approvalSchema = z.object({
  valor_total: z.number({ invalid_type_error: 'Valor total obrigatório' }).min(0.01, 'Valor deve ser maior que zero'),
})

export const rejectionSchema = z.object({
  motivo_recusa: z.string().min(10, 'Informe o motivo da recusa (mínimo 10 caracteres)'),
})

export type TripStep1Data = z.infer<typeof tripStep1Schema>
export type TripStep2Data = z.infer<typeof tripStep2Schema>
export type TripStep3Data = z.infer<typeof tripStep3Schema>
export type TripStep4Data = z.infer<typeof tripStep4Schema>
export type TripStep5Data = z.infer<typeof tripStep5Schema>
export type TripStep6Data = z.infer<typeof tripStep6Schema>
