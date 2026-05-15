/** Remove todos os caracteres não numéricos */
export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Normaliza para formato E.164 brasileiro (55XXXXXXXXXXX).
 * Retorna null se não conseguir normalizar.
 */
export function normalizePhone(raw: string): string | null {
  const d = digitsOnly(raw)
  // Já tem DDI 55
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d
  // Sem DDI — adiciona 55
  if (d.length === 10 || d.length === 11) return `55${d}`
  return null
}

/** Valida se é um número brasileiro válido (com ou sem 55 na frente) */
export function isValidPhone(raw: string): boolean {
  const normalized = normalizePhone(raw)
  if (!normalized) return false
  return normalized.length === 12 || normalized.length === 13
}

/**
 * Mascara o número para exibição segura: +55 (31) *****-9999
 */
export function maskPhone(raw: string): string {
  const d = digitsOnly(raw)
  const local = d.startsWith('55') ? d.slice(2) : d
  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) *****-${local.slice(-4)}`
  }
  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ****-${local.slice(-4)}`
  }
  return raw
}

/**
 * Formata para exibição amigável: +55 (31) 99999-9999
 */
export function formatPhoneDisplay(raw: string): string {
  const d = digitsOnly(raw)
  const local = d.startsWith('55') ? d.slice(2) : d
  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  }
  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }
  return raw ? `+55 ${raw}` : ''
}
