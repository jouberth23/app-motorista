import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Smartphone, Wifi, BellRing, ArrowUpFromLine } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  )
}

function detectPlatform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

function getStorage(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

function setStorage(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch { /* private mode */ }
}

const IOS_DISMISSED_KEY = 'pwa-ios-dismissed-v1'

export function PWAInstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [platform] = useState(() => detectPlatform())

  useEffect(() => {
    if (isStandalone()) return

    if (platform === 'ios') {
      if (getStorage(IOS_DISMISSED_KEY)) return
      setTimeout(() => setVisible(true), 2000)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setVisible(true), 1500)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [platform])

  useEffect(() => {
    const handler = () => { setVisible(false); setPrompt(null) }
    window.addEventListener('appinstalled', handler)
    return () => window.removeEventListener('appinstalled', handler)
  }, [])

  const handleInstall = async () => {
    if (!prompt) return
    setInstalling(true)
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setVisible(false)
    setPrompt(null)
    setInstalling(false)
  }

  const handleClose = () => {
    setVisible(false)
    if (platform === 'ios') setStorage(IOS_DISMISSED_KEY, '1')
  }

  const isIOS = platform === 'ios'

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
          <div className="relative rounded-2xl border border-primary/20 bg-[#0d1426] shadow-2xl shadow-black/60 overflow-hidden">
            <div className="h-0.5 w-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600" />

            <button
              onClick={handleClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-4 pt-3.5">
              {/* App header */}
              <div className="flex items-center gap-3 mb-3 pr-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40 overflow-hidden">
                  <img src="/icons/icon-192.png" alt="Transmundim Logística" className="w-10 h-10" />
                </div>
                <div className="min-w-0">
                  <p className="font-display font-semibold text-sm text-foreground leading-tight">
                    Instalar Transmundim Logística
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isIOS ? 'Abrir como app — sem o Safari' : 'Adicionar à tela inicial'}
                  </p>
                </div>
              </div>

              {isIOS ? (
                /* iOS: instruções passo a passo para Safari */
                <>
                  <div className="space-y-2 mb-4">
                    <IOSStep n={1}>
                      Toque em{' '}
                      <span className="inline-flex items-center gap-1 font-semibold text-blue-400">
                        Compartilhar <ArrowUpFromLine className="h-3.5 w-3.5" />
                      </span>{' '}
                      na barra inferior do Safari
                    </IOSStep>
                    <IOSStep n={2}>
                      Role e toque em{' '}
                      <span className="font-semibold text-foreground">"Adicionar à Tela de Início"</span>
                    </IOSStep>
                    <IOSStep n={3}>
                      Toque em{' '}
                      <span className="font-semibold text-foreground">Adicionar</span>
                      {' '}— o app abrirá sem o Safari
                    </IOSStep>
                  </div>

                  <div className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-[11px] text-amber-300/90 text-center">
                      Use o <span className="font-semibold">Safari</span> para poder instalar no iPhone/iPad
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs text-muted-foreground h-9"
                      onClick={handleClose}
                    >
                      Fechar
                    </Button>
                    <Button size="sm" className="flex-[2] h-9 text-xs" onClick={handleClose}>
                      <Smartphone className="h-3.5 w-3.5" />
                      Já instalei
                    </Button>
                  </div>
                </>
              ) : (
                /* Android/Desktop: instalação com um clique */
                <>
                  <div className="flex gap-4 mb-4 py-3 px-3 rounded-xl bg-white/[0.03] border border-white/5">
                    <Benefit icon={Wifi} label="Funciona offline" />
                    <Benefit icon={BellRing} label="Notificações" />
                    <Benefit icon={Smartphone} label="Tela cheia" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-muted-foreground hover:text-foreground text-xs h-9"
                      onClick={handleClose}
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
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function IOSStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-400 mt-0.5">
        {n}
      </span>
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
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
