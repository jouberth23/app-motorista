import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PWAUpdatePrompt() {
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

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handleControllerChange = () => {
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  return null
}
