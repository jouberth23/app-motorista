import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  KeyRound, Plus, Trash2, Power, PowerOff, Loader2,
  Copy, CheckCircle2, Clock, Infinity, AlertCircle,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/constants'
import type { AppRole } from '@/types/enums'

interface AccessCode {
  id: string
  codigo: string
  role: AppRole
  label: string | null
  ativo: boolean
  max_uses: number | null
  used_count: number
  expires_at: string | null
  created_at: string
}

const newCodeSchema = z.object({
  codigo: z.string().min(4, 'Mínimo 4 caracteres').max(20, 'Máximo 20 caracteres'),
  role: z.enum(['motorista', 'supervisor', 'admin'] as const),
  label: z.string().optional(),
  max_uses: z.string().optional(),
  expires_at: z.string().optional(),
})
type NewCodeData = z.infer<typeof newCodeSchema>

const ROLE_BADGE: Record<AppRole, string> = {
  motorista: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  supervisor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  admin: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

function generateCode(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString()
}

export function AccessCodesPage() {
  const { user } = useAuthContext()
  const [codes, setCodes] = useState<AccessCode[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const form = useForm<NewCodeData>({
    resolver: zodResolver(newCodeSchema),
    defaultValues: { codigo: generateCode(), role: 'motorista' },
  })

  const fetchCodes = async () => {
    const { data } = await supabase
      .from('access_codes')
      .select('*')
      .order('created_at', { ascending: false })
    setCodes(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchCodes() }, [])

  const handleCreate = async (data: NewCodeData) => {
    setSaving(true)
    try {
      const { error } = await supabase.from('access_codes').insert({
        codigo: data.codigo.trim(),
        role: data.role,
        label: data.label?.trim() || null,
        max_uses: data.max_uses ? parseInt(data.max_uses) : null,
        expires_at: data.expires_at || null,
        created_by: user?.id,
      })
      if (error) {
        if (error.message.includes('unique')) {
          toast.error('Este código já existe. Use outro.')
        } else {
          toast.error(error.message)
        }
        return
      }
      toast.success('Código criado com sucesso!')
      setDialogOpen(false)
      form.reset({ codigo: generateCode(), role: 'motorista' })
      fetchCodes()
    } catch {
      toast.error('Erro ao criar código.')
    } finally {
      setSaving(false)
    }
  }

  const toggleAtivo = async (code: AccessCode) => {
    const { error } = await supabase
      .from('access_codes')
      .update({ ativo: !code.ativo })
      .eq('id', code.id)
    if (error) { toast.error('Erro ao atualizar código.'); return }
    toast.success(code.ativo ? 'Código desativado' : 'Código ativado')
    setCodes((prev) => prev.map((c) => c.id === code.id ? { ...c, ativo: !c.ativo } : c))
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir permanentemente este código?')) return
    const { error } = await supabase.from('access_codes').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir.'); return }
    toast.success('Código excluído')
    setCodes((prev) => prev.filter((c) => c.id !== id))
  }

  const copyCode = (codigo: string, id: string) => {
    navigator.clipboard.writeText(codigo)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
    toast.success('Código copiado!')
  }

  const isExpired = (code: AccessCode) =>
    code.expires_at ? new Date(code.expires_at) < new Date() : false

  const isExhausted = (code: AccessCode) =>
    code.max_uses !== null && code.used_count >= code.max_uses

  return (
    <div className="space-y-6">
      <PageHeader
        title="Códigos de Acesso"
        description="Gerencie as chaves de acesso para novos cadastros"
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo código
          </Button>
        }
      />

      {loading ? (
        <div className="glass-card p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : codes.length === 0 ? (
        <div className="glass-card p-10 flex flex-col items-center text-center gap-3">
          <KeyRound className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhum código criado ainda.</p>
          <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm">
            <Plus className="h-4 w-4" /> Criar primeiro código
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {codes.map((code, i) => {
            const expired = isExpired(code)
            const exhausted = isExhausted(code)
            const inactive = !code.ativo || expired || exhausted

            return (
              <motion.div
                key={code.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  'glass-card p-4 flex flex-wrap items-center gap-3',
                  inactive && 'opacity-60',
                )}
              >
                {/* Code + copy */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold',
                    inactive
                      ? 'bg-muted/30 border-border text-muted-foreground'
                      : 'bg-primary/10 border-primary/30 text-primary',
                  )}>
                    <KeyRound className="h-3.5 w-3.5" />
                    {code.codigo}
                  </div>
                  <button
                    onClick={() => copyCode(code.codigo, code.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    title="Copiar código"
                  >
                    {copiedId === code.id
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Role badge */}
                <span className={cn(
                  'px-2.5 py-0.5 rounded-full border text-xs font-semibold',
                  ROLE_BADGE[code.role],
                )}>
                  {ROLE_LABELS[code.role]}
                </span>

                {/* Label */}
                {code.label && (
                  <span className="text-sm text-muted-foreground flex-1 min-w-0 truncate">
                    {code.label}
                  </span>
                )}

                {/* Status badges */}
                <div className="flex flex-wrap gap-1.5 ml-auto items-center">
                  {!code.ativo && (
                    <span className="px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground text-xs border border-border">
                      Desativado
                    </span>
                  )}
                  {expired && (
                    <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs border border-destructive/20 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Expirado
                    </span>
                  )}
                  {exhausted && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs border border-amber-500/20 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Esgotado
                    </span>
                  )}

                  {/* Usage */}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {code.used_count} /
                    {code.max_uses === null
                      ? <Infinity className="h-3 w-3" />
                      : code.max_uses}
                  </span>

                  {/* Expiry */}
                  {code.expires_at && (
                    <span className="text-xs text-muted-foreground">
                      Expira: {formatDateTime(code.expires_at)}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleAtivo(code)}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      code.ativo
                        ? 'text-emerald-400 hover:bg-emerald-500/10'
                        : 'text-muted-foreground hover:bg-muted/40',
                    )}
                    title={code.ativo ? 'Desativar' : 'Ativar'}
                  >
                    {code.ativo ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(code.id)}
                    className="p-2 rounded-lg text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Novo código de acesso</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Código *</Label>
              <div className="flex gap-2">
                <Input
                  {...form.register('codigo')}
                  placeholder="Ex: 23424531"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => form.setValue('codigo', generateCode())}
                >
                  Gerar
                </Button>
              </div>
              {form.formState.errors.codigo && (
                <p className="text-xs text-destructive">{form.formState.errors.codigo.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Perfil *</Label>
              <Select
                defaultValue="motorista"
                onValueChange={(v) => form.setValue('role', v as AppRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="motorista">Motorista</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input {...form.register('label')} placeholder="Ex: Motoristas turno noturno" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Máx. de usos (opcional)</Label>
                <Input
                  {...form.register('max_uses')}
                  type="number"
                  placeholder="Ilimitado"
                  min="1"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expira em (opcional)</Label>
                <Input
                  {...form.register('expires_at')}
                  type="datetime-local"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar código
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
