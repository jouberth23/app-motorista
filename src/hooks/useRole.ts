import type { AppRole } from '@/types/enums'

export function useRole(role: AppRole | null) {
  const isMotorista = role === 'motorista'
  const isSupervisor = role === 'supervisor'
  const isAdmin = role === 'admin'
  const isCentral = isSupervisor || isAdmin
  const canApprove = isCentral
  const canSetValue = isCentral
  const canViewAll = isCentral

  return {
    isMotorista,
    isSupervisor,
    isAdmin,
    isCentral,
    canApprove,
    canSetValue,
    canViewAll,
    role,
  }
}
