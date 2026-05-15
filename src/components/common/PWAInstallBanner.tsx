import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Smartphone, Wifi, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'tv_pwa_banner_dismissed'
const DISMISSED_UNTIL_KEY = 'tv_pwa_banner_dismissed_until'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  )
}

export function PWAInstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Don't show if already installed
    if (isStandalone()) return

    // Don't show if permanently dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return

    // Don't show if snoozed
    const until = localStorage.getItem(DISMISSED_UNTIL_KEY)
    if (until && Date.now() < Number(until)) return

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
      // Small delay so the page settles before showing the banner
      setTimeout(() => setVisible(true), 2500)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Hide banner once installed
  useEffect(() => {
    const handler = () => {
      setVisible(false)
      setPrompt(null)
    }
    window.addEventListener('appinstalled', handler)
    return () => window.removeEventListener('appinstalled', handler)
  }, [])

  const handleInstall = async () => {
    if (!prompt) return
    setInstalling(true)
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem(DISMISSED_KEY, '1')
    }
    setVisible(false)
    setPrompt(null)
    setInstalling(false)
  }

  // Snooze for 3 days
  const handleSnooze = () => {
    localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + 1000 * 60 * 60 * 24 * 3))
    setVisible(false)
  }

  // Permanently dismiss
  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:bottom-6 lg:left-auto lg:right-6 lg:max-w-sm"
        >
          {/* Card */}
          <div className="relative rounded-2xl border border-primary/20 bg-[#0d1426] shadow-2xl shadow-black/60 overflow-hidden">

            {/* Blue top accent */}
            <div className="h-0.5 w-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600" />

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-4 pt-3.5">
              {/* Header */}
              <div className="flex items-center gap-3 mb-3 pr-6">
                {/* App icon */}
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
                  <img
                    src="/icons/icon-192.svg"
                    alt="TaxiVoucher"
                    className="w-10 h-10"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                </div>

                <div className="min-w-0">
                  <p className="font-display font-semibold text-sm text-foreground leading-tight">
                    Instalar TaxiVoucher
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Adicionar à tela inicial
                  </p>
                </div>
              </div>

              {/* Benefits */}
              <div className="flex gap-4 mb-4 py-3 px-3 rounded-xl bg-white/[0.03] border border-white/5">
                <Benefit icon={Wifi} label="Funciona offline" />
                <Benefit icon={BellRing} label="Notificações" />
                <Benefit icon={Smartphone} label="Tela cheia" />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-muted-foreground hover:text-foreground text-xs h-9"
                  onClick={handleSnooze}
                >
                  Agora não
                </Button>
                <Button
                  size="sm"
                  className="flex-[2] gap-2 h-9"
                  onClick={handleInstall}
                  disabled={installing}
                >
                  <Download className="h-3.5 w-3.5" />
                  {installing ? 'Instalando...' : 'Instalar app'}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Benefit({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
      <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
    </div>
  )
}
