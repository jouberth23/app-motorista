import { useRef, useState } from 'react'
import { Camera, X, ZoomIn, CheckCircle2, Loader2, MapPin, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCurrentLocation } from '@/lib/geolocation'
import { stampPhoto } from '@/services/photoStamp'
import { toast } from 'sonner'
import type { LocationData } from '@/lib/geolocation'

export interface PhotoCaptureResult {
  originalFile: File
  stampedFile: File
  previewUrl: string
  capturedAt: string
  latitude?: number
  longitude?: number
  accuracy?: number
  address?: string
  locationDenied: boolean
}

export interface StampMeta {
  tipo: 'km_inicial' | 'km_final'
  driverName: string
  base: string
  protocolo: string
}

interface PhotoCaptureProps {
  label: string
  description?: string
  onCapture: (result: PhotoCaptureResult) => void
  previewUrl?: string
  disabled?: boolean
  error?: string
  stampMeta: StampMeta
}

export function PhotoCapture({
  label,
  description,
  onCapture,
  previewUrl,
  disabled,
  error,
  stampMeta,
}: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [processing, setProcessing] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setProcessing(true)
    const capturedAt = new Date()

    let location: LocationData | undefined
    let locationDenied = false

    try {
      location = await getCurrentLocation(8000)
    } catch (err) {
      const geoErr = err as GeolocationPositionError
      if (geoErr?.code === 1 /* PERMISSION_DENIED */) {
        locationDenied = true
        toast.warning('Localização não autorizada. A central será informada.', {
          duration: 5000,
          icon: <AlertTriangle className="h-4 w-4" />,
        })
      }
      // Timeout/unavailable: proceed without location silently
    }

    try {
      const { stampedFile, stampedDataUrl } = await stampPhoto(file, {
        ...stampMeta,
        capturedAt,
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy: location?.accuracy,
        address: location?.address,
      })

      onCapture({
        originalFile: file,
        stampedFile,
        previewUrl: stampedDataUrl,
        capturedAt: capturedAt.toISOString(),
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy: location?.accuracy,
        address: location?.address,
        locationDenied,
      })
    } catch {
      // Stamping failed — fall back to original without stamp
      const reader = new FileReader()
      reader.onload = (ev) => {
        onCapture({
          originalFile: file,
          stampedFile: file,
          previewUrl: ev.target?.result as string,
          capturedAt: capturedAt.toISOString(),
          latitude: location?.latitude,
          longitude: location?.longitude,
          accuracy: location?.accuracy,
          address: location?.address,
          locationDenied,
        })
      }
      reader.readAsDataURL(file)
    } finally {
      setProcessing(false)
    }
  }

  const handleClick = () => {
    if (!disabled && !processing) fileInputRef.current?.click()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {previewUrl && !processing && (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        )}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileChange}
        disabled={disabled || processing}
      />

      {processing ? (
        <div className="w-full h-40 border-2 border-dashed border-primary/30 rounded-xl flex flex-col items-center justify-center gap-3 bg-primary/5">
          <Loader2 className="h-7 w-7 text-primary animate-spin" />
          <div className="text-center">
            <p className="text-sm text-primary font-medium">Processando foto...</p>
            <p className="text-xs text-muted-foreground">Obtendo localização e aplicando carimbo</p>
          </div>
        </div>
      ) : previewUrl ? (
        <div className="relative group">
          <div className="relative border border-emerald-500/40 rounded-xl overflow-hidden bg-muted/20">
            <img
              src={previewUrl}
              alt={label}
              className="w-full h-40 object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <ZoomIn className="h-5 w-5 text-white" />
              </button>
              {!disabled && (
                <button
                  type="button"
                  onClick={handleClick}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <Camera className="h-5 w-5 text-white" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Foto carimbada registrada
            <MapPin className="h-3 w-3 ml-1 text-muted-foreground" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            'w-full h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-all',
            error
              ? 'border-destructive bg-destructive/5'
              : 'border-border hover:border-primary/50 hover:bg-primary/5',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <div className="p-3 rounded-full bg-muted/50">
            <Camera className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground font-medium">Tirar foto</p>
            <p className="text-xs text-muted-foreground/60">GPS + carimbo aplicados automaticamente</p>
          </div>
        </button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {fullscreen && previewUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setFullscreen(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setFullscreen(false)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={previewUrl}
            alt={label}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
