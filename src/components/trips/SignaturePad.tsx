import { useRef, useState, useMemo } from 'react'
import ReactSignatureCanvas from 'react-signature-canvas'
import { Trash2, PenLine, Keyboard, CheckCircle2, User, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface SignatureResult {
  dataUrl: string
  signerName: string
  matricula?: string
  method: 'typed' | 'drawn' | 'profile'
  signedAt: string
}

interface SignaturePadProps {
  label: string
  signerType: 'passenger' | 'driver'
  defaultName?: string
  defaultMatricula?: string
  driverName?: string
  onSave: (result: SignatureResult) => void
  savedResult?: Partial<SignatureResult>
  disabled?: boolean
  error?: string
}

type Mode = 'typed' | 'drawn' | 'profile'

function buildTypedCanvas(name: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 480
  canvas.height = 120
  const ctx = canvas.getContext('2d')!

  // Baseline
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(24, 96)
  ctx.lineTo(canvas.width - 24, 96)
  ctx.stroke()

  // Scale font to fit
  let fontSize = 58
  ctx.font = `italic ${fontSize}px 'Brush Script MT','Apple Chancery','Palatino Linotype',cursive`
  while (ctx.measureText(name).width > canvas.width - 64 && fontSize > 20) {
    fontSize -= 2
    ctx.font = `italic ${fontSize}px 'Brush Script MT','Apple Chancery','Palatino Linotype',cursive`
  }

  ctx.shadowColor = 'rgba(37,99,235,0.28)'
  ctx.shadowBlur = 7
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 2
  ctx.fillStyle = '#d8e2f5'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(name, canvas.width / 2, 90)

  return canvas.toDataURL('image/png')
}

const METHOD_LABELS: Record<string, string> = {
  typed: 'Digitada',
  drawn: 'Desenhada',
  profile: 'Automática (Perfil)',
}

function CheckboxField({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex gap-3 items-start cursor-pointer p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/30 transition-colors select-none">
      <span className="flex-shrink-0 mt-0.5">
        <span
          className={cn(
            'flex w-4 h-4 rounded border-2 items-center justify-center transition-all',
            checked ? 'bg-primary border-primary' : 'border-muted-foreground/40 bg-transparent',
          )}
        >
          {checked && (
            <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
              <path
                d="M2 6l3 3 5-5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-xs text-muted-foreground leading-relaxed">{children}</span>
    </label>
  )
}

export function SignaturePad({
  label,
  signerType,
  defaultName = '',
  defaultMatricula = '',
  driverName = '',
  onSave,
  savedResult,
  disabled,
  error,
}: SignaturePadProps) {
  const sigRef = useRef<ReactSignatureCanvas>(null)
  const [mode, setMode] = useState<Mode>(signerType === 'driver' ? 'profile' : 'typed')

  // Typed state
  const [typedName, setTypedName] = useState(defaultName)
  const [typedMatricula, setTypedMatricula] = useState(defaultMatricula)
  const [typedChecked, setTypedChecked] = useState(false)

  // Drawn state
  const [drawnEmpty, setDrawnEmpty] = useState(true)
  const [drawnName, setDrawnName] = useState(defaultName)

  // Profile state
  const [profileChecked, setProfileChecked] = useState(false)

  const isSaved = Boolean(savedResult?.dataUrl)

  const typedPreview = useMemo(
    () => (typedName.trim() ? buildTypedCanvas(typedName) : ''),
    [typedName],
  )
  const profilePreview = useMemo(() => (driverName ? buildTypedCanvas(driverName) : ''), [driverName])

  const handleSaveTyped = () => {
    if (!typedName.trim() || !typedChecked) return
    onSave({
      dataUrl: buildTypedCanvas(typedName),
      signerName: typedName.trim(),
      matricula: typedMatricula.trim() || undefined,
      method: 'typed',
      signedAt: new Date().toISOString(),
    })
  }

  const handleSaveDrawn = () => {
    if (!sigRef.current || sigRef.current.isEmpty()) return
    const name = signerType === 'driver' ? driverName : drawnName
    onSave({
      dataUrl: sigRef.current.toDataURL('image/png'),
      signerName: name || defaultName,
      method: 'drawn',
      signedAt: new Date().toISOString(),
    })
  }

  const handleSaveProfile = () => {
    if (!profileChecked || !driverName) return
    onSave({
      dataUrl: buildTypedCanvas(driverName),
      signerName: driverName,
      method: 'profile',
      signedAt: new Date().toISOString(),
    })
  }

  const handleRefazer = () => {
    setTypedChecked(false)
    setProfileChecked(false)
    setDrawnEmpty(true)
    sigRef.current?.clear()
    onSave({ dataUrl: '', signerName: '', method: mode, signedAt: '' })
  }

  // ── Saved view ──────────────────────────────────────────────────────────
  if (isSaved) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {!disabled && (
            <button
              type="button"
              onClick={handleRefazer}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Refazer
            </button>
          )}
        </div>
        <div className="border border-emerald-500/40 rounded-xl bg-emerald-500/5 p-4 space-y-3">
          <img src={savedResult!.dataUrl} alt={label} className="max-h-20 w-auto mx-auto" />
          <div className="border-t border-emerald-500/20 pt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              Nome: <span className="font-medium text-foreground">{savedResult!.signerName}</span>
            </span>
            {savedResult!.matricula && (
              <span className="text-muted-foreground">
                Matrícula:{' '}
                <span className="font-medium text-foreground">{savedResult!.matricula}</span>
              </span>
            )}
            <span className="text-muted-foreground">
              Tipo:{' '}
              <span className="font-medium text-emerald-400">
                {METHOD_LABELS[savedResult!.method ?? ''] ?? ''}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">Assinatura registrada</span>
          </div>
        </div>
      </div>
    )
  }

  // ── Form view ────────────────────────────────────────────────────────────
  const modes: { id: Mode; label: string; icon: React.ReactNode }[] =
    signerType === 'driver'
      ? [
          { id: 'profile', label: 'Automática', icon: <User className="h-3.5 w-3.5" /> },
          { id: 'drawn', label: 'Desenhada', icon: <PenLine className="h-3.5 w-3.5" /> },
        ]
      : [
          { id: 'typed', label: 'Digitada', icon: <Keyboard className="h-3.5 w-3.5" /> },
          { id: 'drawn', label: 'Desenhada', icon: <PenLine className="h-3.5 w-3.5" /> },
        ]

  return (
    <div className={cn('space-y-3', disabled && 'opacity-50 pointer-events-none')}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
          Recomendado: {signerType === 'driver' ? 'Automática' : 'Digitada'}
        </span>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/40 border border-border">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all',
              mode === m.id
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* ── TYPED ────────────────────────────────────────────────────────── */}
      {mode === 'typed' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">Nome Completo *</Label>
              <Input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Digite o nome completo do passageiro"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Matrícula (opcional)</Label>
              <Input
                value={typedMatricula}
                onChange={(e) => setTypedMatricula(e.target.value)}
                placeholder="Ex: 12345"
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Pré-visualização:</p>
            <div className="border border-border rounded-xl bg-[#080b11] min-h-[90px] flex items-center justify-center px-4 py-2">
              {typedPreview ? (
                <img src={typedPreview} alt="Preview da assinatura" className="max-h-24 w-auto" />
              ) : (
                <p className="text-muted-foreground/40 text-xs italic">
                  Digite o nome acima para visualizar a assinatura
                </p>
              )}
            </div>
          </div>

          <CheckboxField checked={typedChecked} onChange={setTypedChecked}>
            Confirmo que as informações desta viagem estão corretas e autorizo o uso desta
            assinatura digital neste relatório.
          </CheckboxField>

          <Button
            type="button"
            className="w-full"
            variant="success"
            size="lg"
            onClick={handleSaveTyped}
            disabled={!typedName.trim() || !typedChecked}
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Assinatura
          </Button>
        </div>
      )}

      {/* ── DRAWN ────────────────────────────────────────────────────────── */}
      {mode === 'drawn' && (
        <div className="space-y-3">
          {signerType === 'passenger' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Nome de quem está assinando *</Label>
              <Input
                value={drawnName}
                onChange={(e) => setDrawnName(e.target.value)}
                placeholder="Nome completo"
                autoComplete="off"
              />
            </div>
          )}

          <div className="relative rounded-xl overflow-hidden border border-border bg-[#080b11]">
            <ReactSignatureCanvas
              ref={sigRef}
              canvasProps={{
                className: 'w-full',
                style: { touchAction: 'none', display: 'block', height: '188px' },
              }}
              backgroundColor="transparent"
              penColor="rgba(210,225,255,0.88)"
              dotSize={2}
              minWidth={1.5}
              maxWidth={3.5}
              velocityFilterWeight={0.7}
              onBegin={() => setDrawnEmpty(false)}
            />
            {drawnEmpty && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
                <PenLine className="h-7 w-7 text-white/15" />
                <p className="text-white/25 text-sm">Assine aqui com o dedo ou caneta</p>
              </div>
            )}
            <div className="absolute bottom-8 left-8 right-8 border-b border-white/8 pointer-events-none" />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                sigRef.current?.clear()
                setDrawnEmpty(true)
              }}
              disabled={drawnEmpty}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar
            </Button>
            <Button
              type="button"
              variant="success"
              size="sm"
              className="flex-1"
              onClick={handleSaveDrawn}
              disabled={drawnEmpty || (signerType === 'passenger' && !drawnName.trim())}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmar Assinatura
            </Button>
          </div>
        </div>
      )}

      {/* ── PROFILE (driver) ─────────────────────────────────────────────── */}
      {mode === 'profile' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Assinatura gerada em nome de:</p>
                <p className="font-semibold text-foreground">{driverName || '—'}</p>
              </div>
            </div>
            <div className="rounded-xl bg-[#080b11] border border-border flex items-center justify-center py-2 min-h-[88px]">
              {profilePreview ? (
                <img src={profilePreview} alt="Assinatura do motorista" className="max-h-20 w-auto" />
              ) : (
                <p className="text-xs text-muted-foreground/40 italic">Nome não disponível</p>
              )}
            </div>
          </div>

          <CheckboxField checked={profileChecked} onChange={setProfileChecked}>
            Confirmo minha assinatura como motorista responsável por esta viagem e declaro que
            as informações registradas são verdadeiras.
          </CheckboxField>

          <Button
            type="button"
            className="w-full"
            variant="success"
            size="lg"
            onClick={handleSaveProfile}
            disabled={!profileChecked || !driverName}
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Assinatura do Motorista
          </Button>
        </div>
      )}
    </div>
  )
}
