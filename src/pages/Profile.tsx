import { useState } from 'react'
import { motion } from 'framer-motion'
import { User, Phone, MapPin, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/common/PageHeader'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { initials } from '@/lib/utils'
import { BASES } from '@/types/enums'
import { ROLE_LABELS } from '@/lib/constants'

export function ProfilePage() {
  const { profile, role, user } = useAuthContext()

  const [nome, setNome] = useState(profile?.nome ?? '')
  const [telefone, setTelefone] = useState(profile?.telefone ?? '')
  const [base, setBase] = useState(profile?.base ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ nome, telefone, base })
        .eq('id', user.id)

      if (error) throw error
      toast.success('Perfil atualizado com sucesso!')
    } catch {
      toast.error('Erro ao atualizar perfil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <PageHeader title="Meu Perfil" description="Gerencie suas informações pessoais" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6 space-y-6"
      >
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-xl">
              {profile?.nome ? initials(profile.nome) : '?'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-display font-semibold text-lg">{profile?.nome ?? 'Usuário'}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
                {role ? ROLE_LABELS[role] : ''}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              Nome completo
            </Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              Telefone
            </Label>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" />
              Base
            </Label>
            <Select value={base} onValueChange={setBase}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione sua base" />
              </SelectTrigger>
              <SelectContent>
                {BASES.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Salvar Alterações
            </>
          )}
        </Button>
      </motion.div>
    </div>
  )
}
