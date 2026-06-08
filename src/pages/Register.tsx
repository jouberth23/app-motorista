import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Car, Eye, EyeOff, Loader2, CheckCircle2,
  User, Building2, ArrowLeft
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthContext } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { APP_NAME, COMPANY_NAME, ROLE_LABELS } from '@/lib/constants'
import type { AppRole } from '@/types/enums'
import { cn } from '@/lib/utils'

const baseSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  telefone: z.string().min(8, 'Telefone inválido'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string(),
})

const motoristaSchema = baseSchema.refine((d) => d.password === d.confirmPassword, {
  message: 'As senhas não coincidem', path: ['confirmPassword'],
})

const centralSchema = baseSchema.extend({
  cargo: z.string().min(2, 'Informe o cargo'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'As senhas não coincidem', path: ['confirmPassword'],
})

type MotoristaData = z.infer<typeof motoristaSchema>
type CentralData = z.infer<typeof centralSchema>

function roleHome(role: AppRole | null): string {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'supervisor') return '/approvals'
  return '/dashboard'
}

const ROLE_COLORS: Record<AppRole, string> = {
  motorista: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  supervisor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  admin: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

interface StoredAccess {
  code: string
  role: AppRole
  label: string | null
}

export function RegisterPage() {
  const navigate = useNavigate()
  const { signUp, user, role, loading: authLoading } = useAuthContext()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [autoLogin, setAutoLogin] = useState(false)
  const [awaitingSession, setAwaitingSession] = useState(false)
  const [access, setAccess] = useState<StoredAccess | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('tv_access')
    if (!raw) { navigate('/'); return }
    try { setAccess(JSON.parse(raw)) }
    catch { navigate('/') }
  }, [navigate])

  // After auto-login on sign-up, wait for the auth state (user + role) to
  // settle before redirecting — never navigate based on a guessed route while
  // AuthGuard would still be showing its own loading screen.
  useEffect(() => {
    if (awaitingSession && !authLoading && user && role) {
      navigate(roleHome(role), { replace: true })
    }
  }, [awaitingSession, authLoading, user, role, navigate])

  const isMotorista = access?.role === 'motorista'
  const isCentral = access?.role === 'supervisor' || access?.role === 'admin'

  const motoristaForm = useForm<MotoristaData>({
    resolver: zodResolver(motoristaSchema),
  })

  const centralForm = useForm<CentralData>({
    resolver: zodResolver(centralSchema),
  })

  const handleSignupError = (error: { message?: string; code?: string } | null) => {
    if (!error) return
    console.error('[Register] Erro no cadastro:', error)
    const msg = (error.message ?? '').toLowerCase()
    if (msg.includes('already registered') || msg.includes('user already registered')) {
      toast.error('Este e-mail já está cadastrado. Tente fazer login.')
    } else if (msg.includes('database error') || msg.includes('unexpected_failure') || msg.includes('saving new user') || msg.includes('creating new user')) {
      toast.error('Erro ao criar perfil do usuário. Contate o suporte.')
    } else if (msg.includes('invalid email')) {
      toast.error('E-mail inválido.')
    } else if (msg.includes('password')) {
      toast.error('Senha muito fraca. Use no mínimo 6 caracteres.')
    } else {
      toast.error(error.message ?? 'Erro ao criar conta. Tente novamente.')
    }
  }

  const handleMotorista = async (data: MotoristaData) => {
    if (!access) return
    setLoading(true)
    try {
      const result = await signUp(data.email, data.password, {
        nome: data.nome,
        telefone: data.telefone,
        access_code: access.code,
      }) as { data: { session: unknown }; error: { message: string; code?: string } | null }

      if (result.error) {
        handleSignupError(result.error)
        return
      }

      sessionStorage.removeItem('tv_access')
      setAutoLogin(!!result.data?.session)
      setDone(true)

      if (result.data?.session) {
        setAwaitingSession(true)
      }
    } catch (err) {
      console.error('[Register] Exceção inesperada:', err)
      toast.error('Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleCentral = async (data: CentralData) => {
    if (!access) return
    setLoading(true)
    try {
      const result = await signUp(data.email, data.password, {
        nome: data.nome,
        telefone: data.telefone,
        cargo: data.cargo,
        access_code: access.code,
      }) as { data: { session: unknown }; error: { message: string; code?: string } | null }

      if (result.error) {
        handleSignupError(result.error)
        return
      }

      sessionStorage.removeItem('tv_access')
      setAutoLogin(!!result.data?.session)
      setDone(true)

      if (result.data?.session) {
        setAwaitingSession(true)
      }
    } catch (err) {
      console.error('[Register] Exceção inesperada:', err)
      toast.error('Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!access) return null

  const roleBadge = (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold',
      ROLE_COLORS[access.role],
    )}>
      {access.role === 'motorista' ? <Car className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
      {ROLE_LABELS[access.role]}
    </span>
  )

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm glass-card p-10 flex flex-col items-center text-center gap-5"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold mb-2">Conta criada!</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {autoLogin
                ? 'Tudo pronto! Você já está conectado — redirecionando...'
                : 'Verifique seu e-mail para confirmar o cadastro e depois faça login com seu e-mail e senha.'}
            </p>
          </div>
          {!autoLogin && (
            <Button className="w-full" onClick={() => navigate('/login')}>
              Ir para o login
            </Button>
          )}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-blue-900/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl overflow-hidden border border-primary/30 mb-3 shadow-xl shadow-primary/10">
            <img src="/icons/icon-512.png" alt={APP_NAME} className="w-full h-full object-cover" />
          </div>
          <h1 className="font-display text-xl font-bold text-foreground">{APP_NAME}</h1>
          <p className="text-xs text-muted-foreground mt-1">{COMPANY_NAME}</p>
        </div>

        <div className="glass-card p-7">
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              {isMotorista
                ? <User className="h-5 w-5 text-primary" />
                : <Building2 className="h-5 w-5 text-primary" />}
              <h2 className="font-display text-base font-semibold">
                {isMotorista ? 'Criar conta de motorista' : 'Criar conta administrativa'}
              </h2>
            </div>
            {roleBadge}
          </div>

          {/* ── MOTORISTA FORM ── */}
          {isMotorista && (
            <form onSubmit={motoristaForm.handleSubmit(handleMotorista)} className="space-y-4">
              <Field label="Nome completo *" error={motoristaForm.formState.errors.nome?.message}>
                <Input placeholder="João da Silva" autoComplete="name" {...motoristaForm.register('nome')} />
              </Field>
              <Field label="Telefone *" error={motoristaForm.formState.errors.telefone?.message}>
                <Input placeholder="(31) 99000-0000" type="tel" {...motoristaForm.register('telefone')} />
              </Field>
              <Field label="E-mail *" error={motoristaForm.formState.errors.email?.message}>
                <Input placeholder="seu@email.com" type="email" autoComplete="email" {...motoristaForm.register('email')} />
              </Field>
              <Field label="Senha *" error={motoristaForm.formState.errors.password?.message}>
                <PasswordInput show={showPassword} onToggle={() => setShowPassword(!showPassword)} {...motoristaForm.register('password')} />
              </Field>
              <Field label="Confirmar senha *" error={motoristaForm.formState.errors.confirmPassword?.message}>
                <PasswordInput show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} placeholder="Repita a senha" {...motoristaForm.register('confirmPassword')} />
              </Field>
              <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Criando conta...</> : 'Criar conta'}
              </Button>
            </form>
          )}

          {/* ── SUPERVISOR / ADMIN FORM ── */}
          {isCentral && (
            <form onSubmit={centralForm.handleSubmit(handleCentral)} className="space-y-4">
              <Field label="Nome completo *" error={centralForm.formState.errors.nome?.message}>
                <Input placeholder="Maria Santos" autoComplete="name" {...centralForm.register('nome')} />
              </Field>
              <Field label="Telefone *" error={centralForm.formState.errors.telefone?.message}>
                <Input placeholder="(31) 99000-0000" type="tel" {...centralForm.register('telefone')} />
              </Field>
              <Field label="E-mail corporativo *" error={centralForm.formState.errors.email?.message}>
                <Input placeholder="seu@empresa.com" type="email" autoComplete="email" {...centralForm.register('email')} />
              </Field>
              <Field label="Cargo / Função *" error={centralForm.formState.errors.cargo?.message}>
                <Input placeholder="Ex: Analista de Logística" {...centralForm.register('cargo')} />
              </Field>
              <Field label="Senha *" error={centralForm.formState.errors.password?.message}>
                <PasswordInput show={showPassword} onToggle={() => setShowPassword(!showPassword)} {...centralForm.register('password')} />
              </Field>
              <Field label="Confirmar senha *" error={centralForm.formState.errors.confirmPassword?.message}>
                <PasswordInput show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} placeholder="Repita a senha" {...centralForm.register('confirmPassword')} />
              </Field>
              <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Criando conta...</> : 'Criar conta'}
              </Button>
            </form>
          )}

          <div className="mt-5 pt-5 border-t border-border text-center">
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Usar outra chave
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5">
          Sistema seguro — dados criptografados
        </p>
      </motion.div>
    </div>
  )
}

function Field({
  label, error, children,
}: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  show: boolean
  onToggle: () => void
}
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ show, onToggle, placeholder = 'Mínimo 6 caracteres', ...props }, ref) => (
    <div className="relative">
      <Input
        ref={ref}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        autoComplete="new-password"
        className="pr-10"
        {...props}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  ),
)
PasswordInput.displayName = 'PasswordInput'

