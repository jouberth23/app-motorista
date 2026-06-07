import { useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/user'
import type { AppRole } from '@/types/enums'

const PROFILE_CACHE_KEY = 'tv_profile_cache'

function saveProfileCache(profile: Profile | null, role: AppRole | null) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ profile, role })) } catch {}
}

function readProfileCache(): { profile: Profile | null; role: AppRole | null } | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION races with getSession() — whichever resolves first wins via initialResolved
      if (event === 'INITIAL_SESSION') {
        if (initialResolved) return
        initialResolved = true
        clearTimeout(safetyTimer)
        if (session?.user) {
          loadUserData(session.user, session)
        } else {
          setState((s) => ({ ...s, loading: false }))
        }
        return
      }
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
      const profile = profileResult.data
      const role = (roleResult.data?.role as AppRole) ?? 'motorista'
      saveProfileCache(profile, role)
      setState({ user, session, profile, role, loading: false })
    } catch {
      // offline: usa cache local se disponível
      const cached = readProfileCache()
      setState({
        user,
        session,
        profile: cached?.profile ?? null,
        role: cached?.role ?? 'motorista',
        loading: false,
      })
    }
  }

  async function signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
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
      options: {
        data: metadata,
        emailRedirectTo: window.location.origin,
      },
    })
  }

  async function signOut() {
    try { localStorage.removeItem(PROFILE_CACHE_KEY) } catch {}
    return supabase.auth.signOut()
  }

  return { ...state, signIn, signUp, signOut }
}
