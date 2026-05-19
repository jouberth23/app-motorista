import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
    offlineReady: [offlineReady],
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates every 60 minutes
      if (r) {
        setInterval(async () => {
          if (!(!r.installing && navigator.onLine)) return
          const resp = await fetch(swUrl, {
            cache: 'no-store',
            headers: { cache: 'no-store', 'cache-control': 'no-cache' },
          })
          if (resp?.status === 200) await r.update()
        }, 1000 * 60 * 60)
      }
    },
  })

  // New SW is waiting — show toast so the user decides when to reload.
  // Using 'prompt' mode ensures no automatic reload ever happens,
  // preventing form data loss during the 9-step trip submission flow.
  useEffect(() => {
    if (!needRefresh) return
    toast('Nova versão disponível', {
      id: 'pwa-update',
      duration: Infinity,
      icon: <RefreshCw className="h-4 w-4 text-primary" />,
      description: 'Salve seu trabalho e recarregue para atualizar.',
      action: {
        label: 'Atualizar agora',
        onClick: () => updateServiceWorker(true),
      },
    })
  }, [needRefresh, updateServiceWorker])

  useEffect(() => {
    if (!offlineReady) return
    toast.success('App pronto para uso offline', { id: 'pwa-offline', duration: 3000 })
  }, [offlineReady])

  return null
}
