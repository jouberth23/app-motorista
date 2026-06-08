import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthContext } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { APP_NAME, COMPANY_NAME } from '@/lib/constants'
import type { AppRole } from '@/types/enums'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})
type FormData = z.infer<typeof schema>

function roleHome(role: AppRole | null): string {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'supervisor') return '/approvals'
  return '/dashboard'
}

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn, user, role, loading: authLoading } = useAuthContext()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pendingRedirect, setPendingRedirect] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user && role) {
      navigate(roleHome(role), { replace: true })
    }
  }, [authLoading, user, role, navigate])

  // After sign-in, wait for role to load then redirect
  useEffect(() => {
    if (pendingRedirect && role) {
      navigate(roleHome(role), { replace: true })
    }
  }, [pendingRedirect, role, navigate])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const email = data.email.trim().toLowerCase()
      const { error } = await signIn(email, data.password)
      if (error) {
        const msg = (error.message ?? '').toLowerCase()
        const code = ((error as unknown as { code?: string }).code ?? '').toLowerCase()
        console.error('[Login] Auth error:', error.message, code)

        if (msg.includes('email not confirmed') || code.includes('email_not_confirmed')) {
          toast.error('Conta não ativada. Fale com o administrador para ativar seu acesso.', { duration: 6000 })
        } else if (msg.includes('invalid') || msg.includes('credentials') || code.includes('invalid_credentials')) {
          toast.error('E-mail ou senha incorretos. Verifique os dados digitados.')
        } else if (msg.includes('too many') || code.includes('over_request_rate_limit') || code.includes('too_many_requests')) {
          toast.error('Muitas tentativas. Aguarde alguns minutos e tente novamente.')
        } else if (msg.includes('user not found') || code.includes('user_not_found')) {
          toast.error('Nenhuma conta encontrada com este e-mail.')
        } else {
          toast.error(`Erro ao entrar: ${error.message}`)
        }
        setLoading(false)
        return
      }
      setPendingRedirect(true)
    } catch {
      toast.error('Erro ao conectar. Verifique sua internet e tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-blue-900/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl overflow-hidden border border-primary/30 mb-4 shadow-xl shadow-primary/10">
            <img src="/icons/icon-512.png" alt={APP_NAME} className="w-full h-full object-cover" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground mt-1">{COMPANY_NAME}</p>
        </div>

        <div className="glass-card p-8">
          <div className="mb-6">
            <h2 className="font-display text-lg font-semibold">Entrar na sua conta</h2>
            <p className="text-sm text-muted-foreground mt-1">Use seu e-mail e senha cadastrados</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                {...register('email')}
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                  className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading || authLoading}>
              {loading || (pendingRedirect && !role) ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Entrando...</>
              ) : 'Entrar'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center space-y-3">
            <p className="text-xs text-muted-foreground">Ainda não tem conta?</p>
            <Link to="/" className="flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium">
              <KeyRound className="h-4 w-4" />
              Usar chave de acesso
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Sistema seguro — dados criptografados
        </p>
      </motion.div>
    </div>
  )
}
