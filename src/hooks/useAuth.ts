import { useEffect, useRef, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/user'
import type { AppRole } from '@/types/enums'

const PROFILE_CACHE_PREFIX = 'tv_profile_cache_'

// Cache por user.id — nunca pode servir o perfil/role de outra conta como fallback
function saveProfileCache(userId: string, profile: Profile | null, role: AppRole | null) {
  try { localStorage.setItem(PROFILE_CACHE_PREFIX + userId, JSON.stringify({ profile, role })) } catch {}
}

function readProfileCache(userId: string): { profile: Profile | null; role: AppRole | null } | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_PREFIX + userId)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function clearProfileCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(PROFILE_CACHE_PREFIX)) localStorage.removeItem(key)
    }
  } catch {}
}

// Dados de viagens/perfil são por-usuário (RLS). Ao trocar de conta no mesmo
// dispositivo, o cache do Service Worker não pode servir respostas de uma
// sessão anterior — isso já causou login/cadastro presos em loading no PWA.
// Limpa também 'supabase-auth', cache legado de versões anteriores do SW.
async function clearTripsCache() {
  if (typeof caches === 'undefined') return
  try { await Promise.all([caches.delete('supabase-rest'), caches.delete('supabase-auth')]) } catch {}
}

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  role: AppRole | null
  loading: boolean
}

// Hard ceiling for profile/role lookup — guarantees loading never hangs forever,
// even if the network/service-worker request never settles (seen on PWA/mobile).
const LOAD_USER_DATA_TIMEOUT_MS = 8000

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    role: null,
    loading: true,
  })

  // Guards against out-of-order results: only the most recent loadUserData call may write state
  const loadSeq = useRef(0)

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

      const proceed = () => {
        if (session?.user) {
          loadUserData(session.user, session)
        } else {
          loadSeq.current++
          setState({ user: null, session: null, profile: null, role: null, loading: false })
        }
      }

      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        // Clear the per-account REST cache BEFORE issuing new profile/role requests —
        // running them concurrently lets the service worker race a cache write against
        // a cache delete on the same store, which can leave the request hanging on PWA.
        clearTripsCache().then(proceed)
      } else {
        proceed()
      }
    })

    return () => {
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, [])

  async function loadUserData(user: User, session: Session) {
    const seq = ++loadSeq.current
    try {
      const [profileResult, roleResult] = await Promise.race([
        Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
        ]),
        timeout(LOAD_USER_DATA_TIMEOUT_MS),
      ])
      if (seq !== loadSeq.current) return // a newer auth event superseded this lookup
      const profile = profileResult.data
      const role = (roleResult.data?.role as AppRole) ?? 'motorista'
      saveProfileCache(user.id, profile, role)
      setState({ user, session, profile, role, loading: false })
    } catch {
      if (seq !== loadSeq.current) return
      // offline ou timeout: usa cache local do MESMO usuário, se disponível (nunca de outra conta)
      const cached = readProfileCache(user.id)
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
    clearProfileCache()
    await clearTripsCache()
    return supabase.auth.signOut()
  }

  return { ...state, signIn, signUp, signOut }
}
