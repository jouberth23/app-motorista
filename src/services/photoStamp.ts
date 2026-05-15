import { APP_NAME } from '@/lib/constants'

export interface StampData {
  tipo: 'km_inicial' | 'km_final'
  driverName: string
  base: string
  protocolo: string
  capturedAt: Date
  latitude?: number
  longitude?: number
  accuracy?: number
  address?: string
}

export interface StampResult {
  stampedFile: File
  stampedDataUrl: string
}

export async function stampPhoto(imageFile: File, stamp: StampData): Promise<StampResult> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(imageFile)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!

      ctx.drawImage(img, 0, 0)

      const typeLabel = stamp.tipo === 'km_inicial' ? 'KM Inicial' : 'KM Final'

      const dateStr = stamp.capturedAt.toLocaleDateString('pt-BR')
      const timeStr = stamp.capturedAt.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      const lines: string[] = [
        APP_NAME,
        typeLabel,
        `Motorista: ${stamp.driverName}`,
        `Base: ${stamp.base}`,
        `Protocolo: ${stamp.protocolo}`,
        `Data/Hora: ${dateStr} ${timeStr}`,
      ]

      if (stamp.address) lines.push(`Local: ${stamp.address}`)

      if (stamp.latitude !== undefined && stamp.longitude !== undefined) {
        lines.push(`GPS: ${stamp.latitude.toFixed(6)}, ${stamp.longitude.toFixed(6)}`)
      }

      // Font size scales with image width, capped for readability
      const baseFontSize = Math.min(Math.max(img.width * 0.028, 16), 42)
      const lineHeight = baseFontSize * 1.45
      const padding = baseFontSize * 0.9

      const stampHeight = Math.min(
        lines.length * lineHeight + padding * 2,
        img.height * 0.25, // max 25% of image height
      )
      const stampY = img.height - stampHeight

      // Semi-transparent dark background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
      ctx.fillRect(0, stampY, img.width, stampHeight)

      // Blue left accent bar
      ctx.fillStyle = '#2563eb'
      ctx.fillRect(0, stampY, Math.max(img.width * 0.005, 4), stampHeight)

      ctx.textBaseline = 'top'
      let textY = stampY + padding

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const isTitle = i === 0
        const isSubtitle = i === 1

        if (textY + lineHeight > stampY + stampHeight - padding * 0.4) break

        if (isTitle) {
          ctx.font = `bold ${Math.round(baseFontSize * 1.15)}px -apple-system, Arial, sans-serif`
          ctx.fillStyle = '#60a5fa'
        } else if (isSubtitle) {
          ctx.font = `bold ${Math.round(baseFontSize * 1.05)}px -apple-system, Arial, sans-serif`
          ctx.fillStyle = '#ffffff'
        } else {
          ctx.font = `${Math.round(baseFontSize)}px -apple-system, Arial, sans-serif`
          ctx.fillStyle = '#e2e8f0'
        }

        ctx.fillText(line, padding * 2.2, textY)
        textY += lineHeight
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Falha ao gerar imagem carimbada'))
            return
          }
          const name = imageFile.name.replace(/(\.[^.]+)?$/, '_stamped.jpg')
          const stampedFile = new File([blob], name, { type: 'image/jpeg' })
          const stampedDataUrl = canvas.toDataURL('image/jpeg', 0.88)
          resolve({ stampedFile, stampedDataUrl })
        },
        'image/jpeg',
        0.88,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Falha ao carregar imagem para carimbo'))
    }

    img.src = objectUrl
  })
}
