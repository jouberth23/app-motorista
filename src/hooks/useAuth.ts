import { useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/user'
import type { AppRole } from '@/types/enums'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  role: AppRole | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    role: null,
    loading: true,
  })

  useEffect(() => {
    let initialResolved = false

    // Safety net: if getSession hangs (token refresh on slow/offline network in PWA),
    // force loading=false after 6s so the app doesn't spin forever
    const safetyTimer = setTimeout(() => {
      if (!initialResolved) {
        initialResolved = true
        setState((s) => ({ ...s, loading: false }))
      }
    }, 6000)

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (initialResolved) return
        initialResolved = true
        clearTimeout(safetyTimer)
        if (session?.user) {
          loadUserData(session.user, session)
        } else {
          setState((s) => ({ ...s, loading: false }))
        }
      })
      .catch(() => {
        if (initialResolved) return
        initialResolved = true
        clearTimeout(safetyTimer)
        setState((s) => ({ ...s, loading: false }))
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserData(session.user, session)
      } else {
        setState({ user: null, session: null, profile: null, role: null, loading: false })
      }
    })

    return () => {
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, [])

  async function loadUserData(user: User, session: Session) {
    try {
      const [profileResult, roleResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
      ])
      setState({
        user,
        session,
        profile: profileResult.data,
        role: (roleResult.data?.role as AppRole) ?? 'motorista',
        loading: false,
      })
    } catch {
      setState({ user, session, profile: null, role: 'motorista', loading: false })
    }
  }

  async function signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signUp(
    email: string,
    password: string,
    metadata: {
      nome: string
      telefone?: string
      base?: string
      cargo?: string
      access_code: string
    },
  ) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })
  }

  async function signOut() {
    return supabase.auth.signOut()
  }

  return { ...state, signIn, signUp, signOut }
}
