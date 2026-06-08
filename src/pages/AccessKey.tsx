import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KeyRound, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { APP_NAME, COMPANY_NAME } from '@/lib/constants'
import type { AppRole } from '@/types/enums'

interface AccessCode {
  code: string
  role: AppRole
  label: string | null
}

export function AccessKeyPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) { setError('Digite sua chave de acesso'); return }

    setLoading(true)
    setError('')

    try {
      const { data, error: dbError } = await supabase
        .from('access_codes')
        .select('codigo, role, label, ativo, expires_at, max_uses, used_count')
        .eq('codigo', trimmed)
        .single()

      if (dbError || !data) {
        setError('Chave de acesso inválida ou não encontrada.')
        return
      }

      if (!data.ativo) {
        setError('Esta chave de acesso está desativada.')
        return
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError('Esta chave de acesso expirou.')
        return
      }

      if (data.max_uses !== null && data.used_count >= data.max_uses) {
        setError('Esta chave de acesso atingiu o limite de usos.')
        return
      }

      // Store validated code info in sessionStorage for the register page
      sessionStorage.setItem(
        'tv_access',
        JSON.stringify({ code: data.codigo, role: data.role, label: data.label } as AccessCode),
      )

      navigate('/register')
    } catch {
      setError('Erro ao verificar chave. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background blobs */}
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
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl overflow-hidden border border-primary/30 mb-4 shadow-xl shadow-primary/10">
            <img src="/icons/icon-512.png" alt={APP_NAME} className="w-full h-full object-cover" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground mt-1">{COMPANY_NAME}</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold">Chave de acesso</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Informe a chave fornecida pela sua empresa
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="access-code">Chave de acesso</Label>
              <Input
                id="access-code"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
                placeholder=""
                autoComplete="off"
                autoFocus
                maxLength={16}
                className={error ? 'border-destructive' : ''}
              />
              {error && (
                <div className="flex items-center gap-1.5 text-destructive text-xs mt-1">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading || !code.trim()}>
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Verificando...</>
              ) : (
                <>Continuar <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Já tenho uma conta →
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
