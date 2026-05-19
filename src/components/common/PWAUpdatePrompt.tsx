import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'

export function PWAUpdatePrompt() {
  const [pendingUpdate, setPendingUpdate] = useState(false)

  useRegisterSW({
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

  // When a new SW takes control, notify the user instead of reloading immediately.
  // Auto-reload was causing the form state (8 steps of trip data) to be wiped
  // mid-submission whenever a deploy happened.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handleControllerChange = () => setPendingUpdate(true)
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
  }, [])

  useEffect(() => {
    if (!pendingUpdate) return
    toast('Nova versão disponível', {
      id: 'pwa-update',
      duration: Infinity,
      icon: <RefreshCw className="h-4 w-4 text-primary" />,
      description: 'Salve seu trabalho e recarregue para atualizar.',
      action: {
        label: 'Atualizar agora',
        onClick: () => window.location.reload(),
      },
    })
  }, [pendingUpdate])

  return null
}
