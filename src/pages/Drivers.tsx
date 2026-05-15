import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, Search, UserCheck, Shield, Car } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { supabase } from '@/lib/supabase'
import { initials } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/constants'
import type { UserWithRole } from '@/types/user'
import type { AppRole } from '@/types/enums'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

export function DriversPage() {
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('nome')

      const { data: roles } = await supabase.from('user_roles').select('*')

      const roleMap = new Map(roles?.map((r) => [r.user_id, r.role]) ?? [])
      const combined: UserWithRole[] = (profiles ?? []).map((p) => ({
        ...p,
        role: (roleMap.get(p.id) as AppRole) ?? 'motorista',
      }))

      setUsers(combined)
    } catch {
      toast.error('Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role: newRole }, { onConflict: 'user_id' })

      if (error) throw error
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)))
      toast.success('Papel atualizado com sucesso')
    } catch {
      toast.error('Erro ao atualizar papel')
    }
  }

  const filtered = users.filter(
    (u) =>
      !search ||
      u.nome.toLowerCase().includes(search.toLowerCase()) ||
      (u.base ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  const roleIcon = (role: AppRole) => {
    if (role === 'admin') return <Shield className="h-3.5 w-3.5 text-primary" />
    if (role === 'supervisor') return <UserCheck className="h-3.5 w-3.5 text-blue-400" />
    return <Car className="h-3.5 w-3.5 text-muted-foreground" />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Motoristas e Usuários"
        description={`${users.length} usuário(s) cadastrado(s)`}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou base..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-card p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-muted rounded animate-pulse w-32" />
                <div className="h-3 bg-muted rounded animate-pulse w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum usuário encontrado" />
      ) : (
        <div className="space-y-2">
          {filtered.map((user) => (
            <motion.div
              key={user.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card p-4 flex items-center gap-4"
            >
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback>{initials(user.nome)}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {roleIcon(user.role)}
                  <span className="font-medium text-sm truncate">{user.nome}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {user.base ?? 'Sem base'} · {user.telefone ?? 'Sem telefone'}
                </div>
              </div>

              <Select
                value={user.role}
                onValueChange={(v) => handleRoleChange(user.id, v as AppRole)}
              >
                <SelectTrigger className="w-40 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
