import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Trip } from '@/types/trip'
import { formatDate, formatTime, formatCurrency, formatDateTime } from '@/lib/utils'
import { TRIP_TYPE_LABELS, COMPANY_NAME, APP_NAME } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

// ── Color palette ──────────────────────────────────────────────────────────────

const C = {
  NAVY:         [10,  15,  30]  as [number,number,number],
  BLUE:         [37,  99,  235] as [number,number,number],
  BLUE_DIM:     [29,  78,  216] as [number,number,number],
  BLUE_MUTED:   [180, 200, 240] as [number,number,number],
  EMERALD:      [16,  185, 129] as [number,number,number],
  EMERALD_DIM:  [5,   120, 85]  as [number,number,number],
  RED:          [239, 68,  68]  as [number,number,number],
  AMBER:        [245, 158, 11]  as [number,number,number],
  ORANGE:       [249, 115, 22]  as [number,number,number],
  SLATE:        [100, 116, 139] as [number,number,number],
  WHITE:        [255, 255, 255] as [number,number,number],
  LIGHT_BG:     [248, 250, 252] as [number,number,number],
  SECTION_BG:   [239, 246, 255] as [number,number,number],
  TEXT_DARK:    [15,  23,  42]  as [number,number,number],
  TEXT_MID:     [71,  85,  105] as [number,number,number],
  TEXT_LIGHT:   [148, 163, 184] as [number,number,number],
  BORDER:       [226, 232, 240] as [number,number,number],
}

const STATUS_COLORS: Record<string, [number,number,number]> = {
  aprovado: C.EMERALD,
  recusado: C.RED,
  enviado:  C.BLUE,
  pendente: C.AMBER,
  rascunho: C.SLATE,
  correcao: C.ORANGE,
}
const STATUS_LABELS: Record<string, string> = {
  aprovado: 'APROVADO',
  recusado: 'RECUSADO',
  enviado:  'ENVIADO',
  pendente: 'PENDENTE',
  rascunho: 'RASCUNHO',
  correcao: 'CORREÇÃO',
}

// ── Internal builder ───────────────────────────────────────────────────────────

async function fetchApproverName(approverId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('nome')
    .eq('id', approverId)
    .single()
  return data?.nome ?? 'Aprovador não identificado'
}

async function buildPDFDoc(
  trip: Trip,
  photoUrls: Record<string, string> = {},
  sigUrls: Record<string, string> = {},
): Promise<jsPDF> {
  const approverName = trip.approved_by ? await fetchApproverName(trip.approved_by) : '—'

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const MARGIN   = 14
  const PAGE_W   = 210
  const PAGE_H   = 297
  const CONTENT_W = PAGE_W - MARGIN * 2
  let y = 0

  // ── Helpers ────────────────────────────────────────────────────────────────

  const miniHeader = (subtitle: string) => {
    doc.setFillColor(...C.NAVY)
    doc.rect(0, 0, PAGE_W, 14, 'F')
    doc.setFillColor(...C.BLUE)
    doc.rect(0, 0, PAGE_W, 2.5, 'F')
    doc.setTextColor(...C.WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(APP_NAME, MARGIN, 10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.BLUE_MUTED)
    doc.setFontSize(7)
    doc.text(`Protocolo: ${trip.protocolo}  ·  ${subtitle}`, PAGE_W - MARGIN, 10, { align: 'right' })
    doc.setFillColor(...C.WHITE)
    doc.rect(0, 14, PAGE_W, PAGE_H - 14, 'F')
    y = 20
  }

  const addSection = (title: string) => {
    if (y > 248) {
      doc.addPage()
      miniHeader(title)
    }
    doc.setFillColor(...C.SECTION_BG)
    doc.rect(MARGIN, y, CONTENT_W, 7.5, 'F')
    doc.setFillColor(...C.BLUE)
    doc.rect(MARGIN, y, 3, 7.5, 'F')
    doc.setTextColor(...C.BLUE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text(title.toUpperCase(), MARGIN + 5.5, y + 5.3)
    y += 10.5
  }

  const addTwoCol = (l1: string, v1: string, l2: string, v2: string) => {
    if (y > 252) { doc.addPage(); miniHeader('') }
    const half = CONTENT_W / 2 - 2
    const x2   = MARGIN + half + 4

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.TEXT_LIGHT)
    doc.text(l1, MARGIN, y)
    doc.text(l2, x2, y)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...C.TEXT_DARK)
    doc.text(v1 || '—', MARGIN, y + 5)
    doc.text(v2 || '—', x2, y + 5)
    y += 11
  }

  const addFullRow = (label: string, value: string) => {
    if (y > 252) { doc.addPage(); miniHeader('') }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.TEXT_LIGHT)
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...C.TEXT_DARK)
    doc.text(value || '—', MARGIN, y + 5)
    y += 11
  }

  const addTextBlock = (text: string, color: [number,number,number] = C.TEXT_DARK, bgColor: [number,number,number] = C.LIGHT_BG) => {
    const lines = doc.splitTextToSize(text || '—', CONTENT_W - 8) as string[]
    const h = Math.max(lines.length * 4.5 + 7, 14)
    doc.setFillColor(...bgColor)
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 2, 2, 'F')
    doc.setTextColor(...color)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(lines, MARGIN + 4, y + 5.5)
    y += h + 5
  }

  // ── Page 1: Main header ────────────────────────────────────────────────────

  const HEADER_H = 38

  // Header background
  doc.setFillColor(...C.NAVY)
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F')

  // Blue accent bar
  doc.setFillColor(...C.BLUE)
  doc.rect(0, 0, PAGE_W, 3, 'F')

  // Icon circle
  doc.setFillColor(...C.BLUE)
  doc.circle(MARGIN + 8, HEADER_H / 2 + 1, 8, 'F')
  doc.setFillColor(255, 255, 255)
  doc.circle(MARGIN + 8, HEADER_H / 2 + 1, 5.5, 'F')
  doc.setFillColor(...C.BLUE)
  doc.circle(MARGIN + 8, HEADER_H / 2 + 1, 3, 'F')

  // App name
  doc.setTextColor(...C.WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(APP_NAME, MARGIN + 19, HEADER_H / 2 - 1.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.BLUE_MUTED)
  doc.text('RELATÓRIO DE VIAGEM DE TÁXI', MARGIN + 19, HEADER_H / 2 + 5.5)
  doc.text(COMPANY_NAME,                 MARGIN + 19, HEADER_H / 2 + 11.5)

  // Status badge (top right)
  const sColor = STATUS_COLORS[trip.status] ?? C.SLATE
  const sLabel = STATUS_LABELS[trip.status] ?? trip.status.toUpperCase()
  doc.setFillColor(...sColor)
  doc.roundedRect(PAGE_W - MARGIN - 30, 6, 30, 8, 1.5, 1.5, 'F')
  doc.setTextColor(...C.WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text(sLabel, PAGE_W - MARGIN - 15, 11.5, { align: 'center' })

  // Protocol & date (right side)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.BLUE_MUTED)
  doc.text(`Protocolo: ${trip.protocolo}`,                       PAGE_W - MARGIN, HEADER_H / 2 + 2,  { align: 'right' })
  doc.text(`Emissão: ${formatDateTime(new Date().toISOString())}`, PAGE_W - MARGIN, HEADER_H / 2 + 9,  { align: 'right' })

  // White background for content
  doc.setFillColor(...C.WHITE)
  doc.rect(0, HEADER_H, PAGE_W, PAGE_H - HEADER_H, 'F')

  y = HEADER_H + 9

  // ── Dados Básicos ──────────────────────────────────────────────────────────

  addSection('Dados Básicos')
  addTwoCol('Taxista', trip.driver_name ?? '—', 'Data', formatDate(trip.data))
  addTwoCol('Placa do Veículo', trip.placa, 'Base', trip.base)
  addTwoCol('Tipo de Viagem', TRIP_TYPE_LABELS[trip.tipo_viagem], 'Setor', trip.setor)

  // ── Horários & KM ─────────────────────────────────────────────────────────

  y += 2
  addSection('Horários e Quilometragem')
  addTwoCol('Hora Inicial', formatTime(trip.hora_inicial), 'Hora Final', formatTime(trip.hora_final))
  addTwoCol('KM Inicial', `${trip.km_inicial} km`, 'KM Final', `${trip.km_final} km`)
  addTwoCol(
    'Total KM / HP', trip.total_km ? `${trip.total_km} km` : '—',
    'Hora Parada',   trip.hora_parada ? formatTime(trip.hora_parada) : '—',
  )

  // ── Locais ────────────────────────────────────────────────────────────────

  y += 2
  addSection('Locais da Viagem')
  addTwoCol('Saída da Base', trip.inicio_base, 'Retorno à Base', trip.final_base)
  addTwoCol('Embarque', trip.embarque_empregado, 'Desembarque', trip.desembarque_empregado)

  // ── Justificativa ─────────────────────────────────────────────────────────

  y += 2
  addSection('Justificativa')
  addTextBlock(trip.justificativa)

  // ── Passageiros ───────────────────────────────────────────────────────────

  y += 2
  addSection('Passageiros')
  if (trip.passengers && trip.passengers.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Nome', 'Matrícula']],
      body: trip.passengers.map((p, i) => [i + 1, p.nome, p.matricula ?? '—']),
      margin: { left: MARGIN, right: MARGIN },
      styles: {
        fontSize: 8,
        textColor: C.TEXT_DARK,
        fillColor: C.WHITE,
        lineColor: C.BORDER,
        lineWidth: 0.2,
        cellPadding: 2.5,
      },
      headStyles: {
        fillColor: C.BLUE,
        textColor: C.WHITE,
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: C.LIGHT_BG },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 30 },
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5
  } else {
    addTextBlock('Nenhum passageiro registrado.', C.TEXT_LIGHT)
  }

  // ── Valor Total ───────────────────────────────────────────────────────────

  y += 2
  addSection('Valor Total da Viagem')
  if (trip.valor_total) {
    doc.setFillColor(240, 253, 244)
    doc.setDrawColor(...C.EMERALD)
    doc.setLineWidth(0.5)
    doc.roundedRect(MARGIN, y, CONTENT_W, 18, 2.5, 2.5, 'FD')

    doc.setTextColor(...C.EMERALD_DIM)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text(formatCurrency(trip.valor_total), MARGIN + 6, y + 13)

    if (trip.valor_definido_em) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...C.TEXT_LIGHT)
      doc.text(`Definido em: ${formatDateTime(trip.valor_definido_em)}`, PAGE_W - MARGIN, y + 13, { align: 'right' })
    }
    y += 22
  } else {
    doc.setFillColor(254, 252, 232)
    doc.setDrawColor(...C.AMBER)
    doc.setLineWidth(0.4)
    doc.roundedRect(MARGIN, y, CONTENT_W, 12, 2, 2, 'FD')
    doc.setTextColor(146, 64, 14)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.text('Aguardando cálculo da central', MARGIN + 5, y + 8)
    y += 16
  }

  // ── Aprovação / Recusa / Correção ─────────────────────────────────────────

  if (trip.approved_at) {
    y += 2
    addSection('Aprovação')
    addTwoCol('Aprovado em', formatDateTime(trip.approved_at), 'Aprovado por', approverName)
  }

  if (trip.motivo_recusa) {
    y += 2
    addSection('Motivo da Recusa')
    addTextBlock(trip.motivo_recusa, C.RED, [254, 242, 242])
  }

  if (trip.motivo_correcao) {
    y += 2
    addSection('Correção Solicitada')
    addTextBlock(trip.motivo_correcao, [124, 45, 18], [255, 247, 237])
  }

  // ── Fotos ─────────────────────────────────────────────────────────────────

  const photos = trip.photos ?? []
  const loadedPhotos = photos.filter((p) => photoUrls[p.id])

  if (loadedPhotos.length > 0) {
    doc.addPage()
    miniHeader('Fotos de Quilometragem')
    addSection('Fotos de Quilometragem')

    if (loadedPhotos.length >= 2) {
      // Side-by-side
      const photoW = (CONTENT_W - 4) / 2
      const photoH = Math.round(photoW * 0.68)

      for (let i = 0; i < Math.min(loadedPhotos.length, 2); i++) {
        const photo = loadedPhotos[i]
        const url   = photoUrls[photo.id]
        const xPos  = MARGIN + i * (photoW + 4)
        const label = photo.tipo === 'km_inicial' ? 'KM Inicial' : 'KM Final'

        doc.setFillColor(...C.LIGHT_BG)
        doc.setDrawColor(...C.BORDER)
        doc.setLineWidth(0.3)
        doc.roundedRect(xPos, y, photoW, photoH + 4, 2, 2, 'FD')

        try {
          const imgData = await loadImageAsBase64(url)
          doc.addImage(imgData, 'JPEG', xPos + 1.5, y + 1.5, photoW - 3, photoH)
        } catch {
          doc.setTextColor(...C.TEXT_LIGHT)
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(7)
          doc.text('Imagem não disponível', xPos + photoW / 2, y + photoH / 2, { align: 'center' })
        }

        // Label strip at bottom of photo
        doc.setFillColor(0, 0, 0)
        doc.rect(xPos + 1.5, y + photoH - 5, photoW - 3, 10, 'F')
        doc.setTextColor(...C.WHITE)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(label, xPos + 4, y + photoH + 2)
      }

      y += photoH + 8

      // Metadata below photos
      for (let i = 0; i < Math.min(loadedPhotos.length, 2); i++) {
        const photo  = loadedPhotos[i]
        const xPos   = MARGIN + i * (photoW + 4)
        const label  = photo.tipo === 'km_inicial' ? 'KM Inicial' : 'KM Final'
        let metaY    = y

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(...C.TEXT_MID)
        doc.text(`${label}:`, xPos, metaY)
        metaY += 4.5

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6)
        doc.setTextColor(...C.TEXT_LIGHT)
        if (photo.captured_at) {
          doc.text(`Capturado: ${formatDateTime(photo.captured_at)}`, xPos, metaY)
          metaY += 3.8
        }
        if (photo.address) {
          const lines = doc.splitTextToSize(`Local: ${photo.address}`, photoW - 2) as string[]
          doc.text(lines, xPos, metaY)
          metaY += lines.length * 3.8
        }
        if (photo.latitude != null && photo.longitude != null) {
          doc.text(`GPS: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`, xPos, metaY)
          if (photo.location_accuracy) {
            metaY += 3.5
            doc.text(`Precisão: ±${Math.round(photo.location_accuracy)} m`, xPos, metaY)
          }
        }
        if (photo.location_denied) {
          metaY += 4
          doc.setTextColor(...C.RED)
          doc.text('Localização negada pelo motorista', xPos, metaY)
        }
      }
      y += 30
    } else {
      // Single photo full-width
      for (const photo of loadedPhotos) {
        const url    = photoUrls[photo.id]
        const label  = photo.tipo === 'km_inicial' ? 'KM Inicial' : 'KM Final'
        const photoH = 90

        doc.setFillColor(...C.LIGHT_BG)
        doc.setDrawColor(...C.BORDER)
        doc.setLineWidth(0.3)
        doc.roundedRect(MARGIN, y, CONTENT_W, photoH + 4, 2, 2, 'FD')

        try {
          const imgData = await loadImageAsBase64(url)
          doc.addImage(imgData, 'JPEG', MARGIN + 1.5, y + 1.5, CONTENT_W - 3, photoH)
        } catch {
          doc.setTextColor(...C.TEXT_LIGHT)
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(7)
          doc.text('Imagem não disponível', PAGE_W / 2, y + photoH / 2, { align: 'center' })
        }

        doc.setFillColor(0, 0, 0)
        doc.rect(MARGIN + 1.5, y + photoH - 5, CONTENT_W - 3, 10, 'F')
        doc.setTextColor(...C.WHITE)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(label, MARGIN + 5, y + photoH + 2)

        y += photoH + 10

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.setTextColor(...C.TEXT_LIGHT)
        if (photo.captured_at) { doc.text(`Capturado: ${formatDateTime(photo.captured_at)}`, MARGIN, y); y += 4 }
        if (photo.address)     { doc.text(`Local: ${photo.address}`, MARGIN, y); y += 4 }
        if (photo.latitude != null && photo.longitude != null) {
          doc.text(`GPS: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`, MARGIN, y)
          y += 4
        }
        if (photo.location_denied) {
          doc.setTextColor(...C.RED)
          doc.text('Localização negada pelo motorista', MARGIN, y)
          y += 4
        }
        y += 4
      }
    }
  }

  // ── Assinaturas ───────────────────────────────────────────────────────────

  const sigs = trip.signatures ?? []
  if (sigs.length > 0) {
    if (y > 200) {
      doc.addPage()
      miniHeader('Assinaturas Digitais')
    }
    addSection('Assinaturas Digitais')

    const orderedSigs = [
      sigs.find((s) => s.tipo === 'passageiro'),
      sigs.find((s) => s.tipo === 'motorista'),
    ].filter(Boolean) as typeof sigs

    for (const sig of orderedSigs) {
      if (y > 246) {
        doc.addPage()
        doc.setFillColor(...C.WHITE)
        doc.rect(0, 0, PAGE_W, PAGE_H, 'F')
        y = MARGIN
      }

      const isPassenger = sig.tipo === 'passageiro'
      const accentColor = isPassenger ? C.BLUE : C.EMERALD
      const BOX_H = 48

      doc.setFillColor(...C.LIGHT_BG)
      doc.setDrawColor(...C.BORDER)
      doc.setLineWidth(0.3)
      doc.roundedRect(MARGIN, y, CONTENT_W, BOX_H, 2.5, 2.5, 'FD')

      // Left accent bar
      doc.setFillColor(...accentColor)
      doc.roundedRect(MARGIN, y, 3.5, BOX_H, 1.5, 1.5, 'F')

      // Type label
      doc.setTextColor(...accentColor)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.text(isPassenger ? 'ASSINATURA DO PASSAGEIRO' : 'ASSINATURA DO MOTORISTA', MARGIN + 7, y + 9)

      // Signer name
      doc.setTextColor(...C.TEXT_DARK)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(sig.signer_name || '—', MARGIN + 7, y + 21)

      // Meta
      doc.setTextColor(...C.TEXT_LIGHT)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text(`Assinado em: ${formatDateTime(sig.signed_at)}`, MARGIN + 7, y + 30)
      doc.text(`Protocolo: ${trip.protocolo}`,                  MARGIN + 7, y + 37)

      // Signature image
      const url = sigUrls[sig.id]
      if (url) {
        try {
          const imgData = await loadImageAsBase64(url, 'png')
          doc.addImage(imgData, 'PNG', PAGE_W - MARGIN - 72, y + 2, 68, 44)
        } catch { /* skip */ }
      }

      y += BOX_H + 7
    }
  }

  // ── Footer (all pages) ────────────────────────────────────────────────────

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    const FOOTER_Y = 284

    doc.setFillColor(...C.NAVY)
    doc.rect(0, FOOTER_Y - 1, PAGE_W, PAGE_H - FOOTER_Y + 1, 'F')
    doc.setFillColor(...C.BLUE)
    doc.rect(0, FOOTER_Y - 1, PAGE_W, 1, 'F')

    doc.setTextColor(120, 150, 200)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    doc.text(
      'Documento gerado e assinado digitalmente pelo sistema Transmundim Voucher · Registro de data, hora, GPS e protocolo único.',
      PAGE_W / 2, FOOTER_Y + 3, { align: 'center' },
    )

    doc.setFontSize(6)
    doc.setTextColor(...C.BLUE_MUTED)
    doc.text(
      `${APP_NAME} · ${COMPANY_NAME} · Prot: ${trip.protocolo} · ID: ${trip.id.slice(0, 12).toUpperCase()}`,
      PAGE_W / 2, FOOTER_Y + 8.5, { align: 'center' },
    )

    doc.setTextColor(80, 110, 170)
    doc.text(`Pág. ${i} / ${totalPages}`, PAGE_W - MARGIN, FOOTER_Y + 8.5, { align: 'right' })
  }

  return doc
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function generateTripPDFBlob(
  trip: Trip,
  photoUrls: Record<string, string> = {},
  sigUrls: Record<string, string> = {},
): Promise<Blob> {
  const doc    = await buildPDFDoc(trip, photoUrls, sigUrls)
  const buffer = doc.output('arraybuffer') as ArrayBuffer
  return new Blob([buffer], { type: 'application/pdf' })
}

export async function generateTripPDF(
  trip: Trip,
  photoUrls: Record<string, string> = {},
  sigUrls: Record<string, string> = {},
): Promise<Blob> {
  const blob = await generateTripPDFBlob(trip, photoUrls, sigUrls)
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `Viagem_${trip.protocolo}.pdf`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return blob
}

export async function saveTripPDF(
  tripId: string,
  protocolo: string,
  blob: Blob,
): Promise<string> {
  const path = `trips/${tripId}/${protocolo}.pdf`

  const { error } = await supabase.storage
    .from('trip-documents')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true })

  if (error) throw error

  const { data: urlData } = supabase.storage.from('trip-documents').getPublicUrl(path)

  const { error: dbError } = await supabase
    .from('trips')
    .update({ pdf_path: path, pdf_generated_at: new Date().toISOString() })
    .eq('id', tripId)

  if (dbError) throw dbError

  return urlData.publicUrl
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function loadImageAsBase64(url: string, format: 'jpeg' | 'png' = 'jpeg'): Promise<string> {
  return new Promise((resolve, reject) => {
    const img       = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas  = document.createElement('canvas')
        canvas.width  = img.width
        canvas.height = img.height
        const ctx     = canvas.getContext('2d')!
        if (format === 'png') {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        } else {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        ctx.drawImage(img, 0, 0)
        resolve(
          format === 'png'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', 0.85),
        )
      } catch (e) {
        // Canvas tainted (CORS) or other draw error — reject so caller shows fallback
        reject(e)
      }
    }
    img.onerror = reject
    img.src     = url
  })
}
