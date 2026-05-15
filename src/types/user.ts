import type { AppRole } from './enums'

export interface Profile {
  id: string
  nome: string
  telefone?: string
  base?: string
  cargo?: string
  avatar_url?: string
  created_at: string
}

export interface UserRole {
  id: string
  user_id: string
  role: AppRole
  created_at: string
}

export interface UserWithRole extends Profile {
  role: AppRole
  email?: string
}
