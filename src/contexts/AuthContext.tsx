import React, { createContext, useContext } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile } from '@/types/user'
import type { AppRole } from '@/types/enums'

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  role: AppRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<unknown>
  signUp: (
    email: string,
    password: string,
    metadata: {
      nome: string
      telefone?: string
      base?: string
      cargo?: string
      access_code: string
    },
  ) => Promise<unknown>
  signOut: () => Promise<unknown>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
