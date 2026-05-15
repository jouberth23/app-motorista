import { Building2, Database, Palette } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { GlassCard } from '@/components/common/GlassCard'

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Configurações"
        description="Configurações globais do sistema"
      />

      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-semibold">Empresa</h3>
            <p className="text-xs text-muted-foreground">Informações da organização</p>
          </div>
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Configure o nome da empresa, logo e informações no arquivo <code className="text-primary bg-muted px-1 rounded">src/lib/constants.ts</code></p>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-semibold">Banco de Dados</h3>
            <p className="text-xs text-muted-foreground">Configuração do Supabase</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="p-3 rounded-xl bg-muted/30 font-mono text-xs space-y-1">
            <div className="text-muted-foreground">VITE_SUPABASE_URL=<span className="text-primary">sua_url_aqui</span></div>
            <div className="text-muted-foreground">VITE_SUPABASE_ANON_KEY=<span className="text-primary">sua_chave_aqui</span></div>
          </div>
          <p className="text-xs text-muted-foreground">Configure no arquivo <code className="text-primary bg-muted px-1 rounded">.env.local</code></p>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
            <Palette className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-semibold">Aparência</h3>
            <p className="text-xs text-muted-foreground">Tema e personalização visual</p>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Tema dark corporativo ativo. Customize as cores em{' '}
            <code className="text-primary bg-muted px-1 rounded">src/index.css</code>
          </p>
        </div>
      </GlassCard>
    </div>
  )
}
