import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates every 60 minutes
      if (r) {
        setInterval(async () => {
          if (!(!r.installing && navigator.onLine)) return
          const resp = await fetch(swUrl, { cache: 'no-store', headers: { cache: 'no-store', 'cache-control': 'no-cache' } })
          if (resp?.status === 200) await r.update()
        }, 1000 * 60 * 60)
      }
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast('Nova versão disponível', {
      id: 'pwa-update',
      duration: Infinity,
      icon: <RefreshCw className="h-4 w-4 text-primary animate-spin" />,
      description: 'Atualize para usar a versão mais recente do TaxiVoucher.',
      action: {
        label: 'Atualizar agora',
        onClick: () => updateServiceWorker(true),
      },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
