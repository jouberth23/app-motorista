import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  MessageCircle, Send, Loader2, CheckCircle2, XCircle, Phone,
  User, Clock, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizePhone, isValidPhone, formatPhoneDisplay, maskPhone } from '@/lib/phone'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Trip } from '@/types/trip'

// ── Types ──────────────────────────────────────────────────────────────────────

interface WhatsappSend {
  id: string
  recipient_name: string | null
  recipient_phone: string
  recipient_kind: string
  status: string
  created_at: string
}

interface DriverProfile {
  nome: string | null
  telefone: string | null
}

interface SendWhatsappDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trip: Trip
  userId: string
}

type Step = 'form' | 'confirm' | 'sending'

// ── Component ──────────────────────────────────────────────────────────────────

export function SendWhatsappDialog({ open, onOpenChange, trip }: SendWhatsappDialogProps) {
  const [step, setStep] = useState<Step>('form')
  const [manualPhone, setManualPhone] = useState('')
  const [manualName, setManualName] = useState('')
  const [extraMessage, setExtraMessage] = useState('')
  const [recentSends, setRecentSends] = useState<WhatsappSend[]>([])
  const [driver, setDriver] = useState<DriverProfile | null>(null)
  const [sending, setSending] = useState(false)

  // Phone validation
  const rawDigits = manualPhone.replace(/\D/g, '')
  const normalized = normalizePhone(manualPhone)
  const phoneValid = isValidPhone(manualPhone)
  const phonePreview = phoneValid && normalized ? formatPhoneDisplay(normalized) : null
  const showAddPrefix = rawDigits.length >= 10 && !rawDigits.startsWith('55') && phoneValid

  const hasValidRecipient = phoneValid

  // Fetch driver profile and recent sends when dialog opens
  useEffect(() => {
    if (!open) {
      setStep('form')
      return
    }
    console.log('[WhatsApp] trip pdf_path:', trip?.pdf_path, trip)
    fetchDriver()
    fetchRecentSends()
  }, [open, trip?.pdf_path])

  const fetchDriver = async () => {
    if (!trip.driver_id) return
    const { data } = await supabase
      .from('profiles')
      .select('nome, telefone')
      .eq('id', trip.driver_id)
      .single()
    if (data) setDriver(data as DriverProfile)
  }

  const fetchRecentSends = async () => {
    const { data } = await supabase
      .from('whatsapp_sends')
      .select('id, recipient_name, recipient_phone, recipient_kind, status, created_at')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setRecentSends(data as WhatsappSend[])
  }

  const fillFromDriver = () => {
    if (driver?.telefone) setManualPhone(driver.telefone)
    if (driver?.nome) setManualName(driver.nome)
  }

  const handleSendClick = () => {
    if (!trip.pdf_path) {
      toast.error('Gere o PDF da viagem antes de enviar por WhatsApp.')
      return
    }
    if (!hasValidRecipient) {
      toast.error('Informe um número válido para enviar.')
      return
    }
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setStep('sending')
    setSending(true)
    try {
      const phone = normalizePhone(manualPhone)
      if (!phone) throw new Error('Número inválido')

      const { data, error: fnError } = await supabase.functions.invoke('send-trip-whatsapp', {
        body: {
          trip_id: trip.id,
          manual_recipients: [{ phone: manualPhone, name: manualName.trim() || 'Destinatário manual' }],
          extra_message: extraMessage.trim() || undefined,
        },
      })

      // fnError only fires when the function is completely unreachable (network/deploy issue)
      if (fnError) throw new Error('Não foi possível conectar com a Edge Function. Verifique o deploy no Supabase.')

      const result = data as { sent: number; failed: number; error: string | null }

      if (result?.error) throw new Error(result.error)

      if (result?.sent > 0) {
        toast.success(`PDF enviado com sucesso para ${formatPhoneDisplay(phone)}`)
        fetchRecentSends()
        setStep('form')
        setTimeout(() => onOpenChange(false), 800)
        return
      }

      throw new Error('Não foi possível enviar o PDF pelo WhatsApp. Verifique a instância da Evolution API.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar')
      setStep('form')
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    if (sending) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-400" />
            Enviar PDF por WhatsApp
          </DialogTitle>
          <DialogDescription>
            Viagem {trip.protocolo} · PDF será enviado ao destinatário
          </DialogDescription>
        </DialogHeader>

        {/* No PDF warning */}
        {!trip.pdf_path && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-300">
              Gere o PDF da viagem antes de enviar por WhatsApp.
            </p>
          </div>
        )}

        {step === 'confirm' ? (
          // ── Confirmation screen ─────────────────────────────────────────────
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
              <p className="text-sm font-semibold text-emerald-400">Confirmar envio?</p>
              <div className="space-y-1 text-sm text-foreground">
                <p>
                  <span className="text-muted-foreground">Viagem:</span>{' '}
                  <span className="font-medium">{trip.protocolo}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Para:</span>{' '}
                  <span className="font-medium font-mono">
                    {normalized ? formatPhoneDisplay(normalized) : manualPhone}
                  </span>
                  {manualName && <span className="text-muted-foreground"> ({manualName})</span>}
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep('form')} disabled={sending}>
                Cancelar
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleConfirm}
                disabled={sending}
              >
                {sending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
                Enviar PDF
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // ── Form ────────────────────────────────────────────────────────────
          <div className="space-y-5">
            {/* Manual recipient */}
            <div className="space-y-3 p-4 rounded-xl border border-border bg-muted/10">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                Enviar para número manual
              </p>

              <div className="space-y-1.5">
                <Label className="text-xs">Número de WhatsApp *</Label>
                <Input
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="(31) 99999-9999"
                  inputMode="numeric"
                  className={cn(
                    manualPhone && !phoneValid && 'border-destructive focus-visible:ring-destructive',
                    manualPhone && phoneValid && 'border-emerald-500/50',
                  )}
                />
                {manualPhone && !phoneValid && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Número de WhatsApp inválido.
                  </p>
                )}
                {phoneValid && phonePreview && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Será enviado para: <span className="font-mono font-medium">{phonePreview}</span>
                    {showAddPrefix && <span className="text-muted-foreground">(+55 adicionado)</span>}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Nome do destinatário (opcional)</Label>
                <Input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Ex: João Silva"
                />
              </div>

              {driver?.telefone && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={fillFromDriver}
                >
                  <User className="h-3.5 w-3.5" />
                  Usar telefone do motorista
                  <span className="text-muted-foreground ml-1">
                    ({maskPhone(driver.telefone)})
                  </span>
                </Button>
              )}
            </div>

            {/* Extra message */}
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem extra (opcional)</Label>
              <Textarea
                value={extraMessage}
                onChange={(e) => setExtraMessage(e.target.value)}
                placeholder="Texto adicional que aparecerá junto com o PDF..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            {/* Send count */}
            {hasValidRecipient && (
              <p className="text-xs text-muted-foreground text-center">
                1 destinatário selecionado
              </p>
            )}

            {/* Recent sends */}
            {recentSends.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Últimos envios desta viagem
                </p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {recentSends.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs"
                    >
                      {s.status === 'sent' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                      ) : s.status === 'pending' ? (
                        <Clock className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                      )}
                      <span className="flex-1 truncate font-mono">
                        {maskPhone(s.recipient_phone)}
                      </span>
                      <span className="text-muted-foreground flex-shrink-0">
                        {s.recipient_kind === 'manual' ? 'Manual' : s.recipient_kind}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSendClick}
                disabled={!hasValidRecipient || !trip.pdf_path}
              >
                <Send className="h-4 w-4" />
                Enviar PDF
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
