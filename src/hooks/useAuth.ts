import { useEffect, useRef, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
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
// sessão anterior.
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

// Hard ceiling para as queries de perfil/role — garante que o loading nunca
// trava para sempre, mesmo que a rede/service-worker não responda.
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
  // Tracks whether the current SIGNED_OUT was triggered by the user (vs session expiry)
  const intentionalSignOut = useRef(false)

  useEffect(() => {
    let initialResolved = false

    // Safety net: if INITIAL_SESSION never fires (e.g. Supabase init race), unblock after 6s.
    const safetyTimer = setTimeout(() => {
      if (!initialResolved) {
        console.warn('[useAuth] safety timer fired — INITIAL_SESSION never resolved')
        initialResolved = true
        setState((s) => ({ ...s, loading: false }))
      }
    }, 6000)

    // ── Initial session load ───────────────────────────────────────────────────
    // getSession() is called as a fallback in case INITIAL_SESSION fires late or
    // not at all in some environments.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (initialResolved) return
        initialResolved = true
        clearTimeout(safetyTimer)
        console.log('[useAuth] getSession resolved, user:', session?.user?.id ?? 'null')
        if (session?.user) {
          loadUserData(session.user, session)
        } else {
          setState((s) => ({ ...s, loading: false }))
        }
      })
      .catch((err) => {
        if (initialResolved) return
        initialResolved = true
        clearTimeout(safetyTimer)
        console.warn('[useAuth] getSession error:', err)
        setState((s) => ({ ...s, loading: false }))
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[useAuth] event:', event, '| user:', session?.user?.id ?? 'null')

      // ── INITIAL_SESSION ────────────────────────────────────────────────────
      // Fires synchronously (or as the first microtask) when the listener is
      // registered. This is the primary path for restoring a session on app open.
      if (event === 'INITIAL_SESSION') {
        if (initialResolved) return
        initialResolved = true
        clearTimeout(safetyTimer)

        if (session?.user) {
          // KEY FIX: se já temos o perfil em cache, desbloqueia o loading
          // IMEDIATAMENTE com os dados salvos — o usuário de retorno nunca fica
          // na tela de carregamento. A query de rede atualiza em background.
          const cached = readProfileCache(session.user.id)
          if (cached) {
            console.log('[useAuth] INITIAL_SESSION: cache hit, unblocking instantly')
            setState({
              user: session.user,
              session,
              profile: cached.profile,
              role: cached.role ?? 'motorista',
              loading: false,
            })
            // Refresh in background — atualiza sem bloquear a UI
            loadUserData(session.user, session, /* silent */ true)
          } else {
            console.log('[useAuth] INITIAL_SESSION: no cache, fetching profile...')
            loadUserData(session.user, session)
          }
        } else {
          console.log('[useAuth] INITIAL_SESSION: no session')
          setState((s) => ({ ...s, loading: false }))
        }
        return
      }

      // ── SIGNED_IN ─────────────────────────────────────────────────────────
      // Fires on explicit login or OAuth/magic-link callback.
      if (event === 'SIGNED_IN') {
        clearTripsCache().then(() => {
          if (session?.user) loadUserData(session.user, session)
          else setState((s) => ({ ...s, loading: false }))
        })
        return
      }

      // ── SIGNED_OUT ────────────────────────────────────────────────────────
      if (event === 'SIGNED_OUT') {
        clearTripsCache().then(() => {
          loadSeq.current++
          if (!intentionalSignOut.current) {
            // Sessão expirou ou o refresh token foi invalidado (não foi o
            // usuário que clicou em "Sair"). Mostra um aviso claro em vez de
            // silenciosamente jogar o usuário na tela de login.
            console.warn('[useAuth] SIGNED_OUT não intencional — sessão expirada ou token inválido')
            toast.error('Sua sessão expirou. Entre novamente para continuar.', {
              id: 'session-expired',
              duration: 6000,
            })
          }
          intentionalSignOut.current = false
          setState({ user: null, session: null, profile: null, role: null, loading: false })
        })
        return
      }

      // ── TOKEN_REFRESHED / outros ──────────────────────────────────────────
      // Refresh periódico do access token — atualiza a sessão em background.
      if (session?.user) {
        loadUserData(session.user, session, /* silent */ true)
      }
    })

    return () => {
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, [])

  // ── loadUserData ──────────────────────────────────────────────────────────
  // Busca perfil e role do Supabase. Quando `silent=true`, não mostra loading
  // (usado para refresh de background quando já temos dados do cache).
  async function loadUserData(user: User, session: Session, silent = false) {
    const seq = ++loadSeq.current
    if (!silent) {
      setState((s) => ({ ...s, loading: true }))
    }
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
      console.log('[useAuth] profile loaded, role:', role)
    } catch (err) {
      if (seq !== loadSeq.current) return
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn('[useAuth] loadUserData failed (' + errMsg + '), using cache fallback')
      // offline ou timeout: usa cache local do MESMO usuário, se disponível
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
    intentionalSignOut.current = true
    clearProfileCache()
    await clearTripsCache()
    return supabase.auth.signOut()
  }

  return { ...state, signIn, signUp, signOut }
}
