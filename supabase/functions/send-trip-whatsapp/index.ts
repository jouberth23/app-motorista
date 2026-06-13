import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EVOLUTION_API_URL    = Deno.env.get('EVOLUTION_API_URL') ?? ''
const EVOLUTION_API_KEY    = Deno.env.get('EVOLUTION_API_KEY') ?? ''
const EVOLUTION_INSTANCE   = Deno.env.get('EVOLUTION_INSTANCE') ?? ''
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ManualRecipient { phone: string; name?: string }
interface Recipient { phone: string; name: string; kind: string }
interface TripRow {
  id: string; protocolo: string; pdf_path: string | null
  driver_id: string; placa: string; data: string
  numero_sequencial: number | null
}

// Always 200 so supabase.functions.invoke never wraps the body in FunctionsHttpError
const ok  = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } })
const err = (message: string) => ok({ error: message, sent: 0, failed: 0 })

function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d
  if (d.length === 10 || d.length === 11) return `55${d}`
  return null
}

function isValidBrazilPhone(digits: string): boolean {
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
}

function buildCaption(trip: TripRow, driverName: string | null, extra?: string): string {
  const base =
    `📋 *Transmundim Logística* — Relatório de Viagem\n\n` +
    `Voucher: *#${trip.numero_sequencial ?? '—'}*\n` +
    `Protocolo: *${trip.protocolo}*\n` +
    `Motorista: ${driverName ?? '-'}\n` +
    `Placa: ${trip.placa}\n\n` +
    `Segue em anexo o PDF do relatório.`
  return extra ? `${base}\n\n${extra}` : base
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Safe config log — values never logged, only presence
    console.log('Evolution config', {
      hasApiUrl: !!EVOLUTION_API_URL,
      hasApiKey: !!EVOLUTION_API_KEY,
      hasInstance: !!EVOLUTION_INSTANCE,
      instance: EVOLUTION_INSTANCE || '(not set)',
    })

    // Auth
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return err('Não autorizado.')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authErr || !user) return err('Não autorizado.')

    // Role check
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleRow || !['supervisor', 'admin'].includes(roleRow.role)) {
      return err('Apenas supervisores e admins podem enviar por WhatsApp.')
    }

    const body = await req.json()
    const { trip_id, manual_recipients, extra_message } = body as {
      trip_id: string
      manual_recipients?: ManualRecipient[]
      extra_message?: string
    }

    console.log('send-trip-whatsapp received', { trip_id, hasTripId: !!trip_id })

    if (!trip_id) return err('trip_id é obrigatório.')

    // Check Evolution API secrets
    const missing: string[] = []
    if (!EVOLUTION_API_URL) missing.push('EVOLUTION_API_URL')
    if (!EVOLUTION_API_KEY) missing.push('EVOLUTION_API_KEY')
    if (!EVOLUTION_INSTANCE) missing.push('EVOLUTION_INSTANCE')
    if (missing.length > 0) {
      return err(`Configuração incompleta da Evolution API: falta ${missing.join(', ')} nos segredos da Edge Function.`)
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '')

    // Validate trip_id looks like a UUID before querying
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRe.test(trip_id)) {
      console.error('trip_id is not a UUID:', trip_id.slice(0, 20))
      return err(`Identificador inválido recebido. O frontend deve enviar o UUID da viagem, não o protocolo.`)
    }

    console.log('Fetching trip', { trip_id })

    // driver_name is not a column in trips — select only real columns
    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('id, protocolo, pdf_path, driver_id, placa, data, numero_sequencial')
      .eq('id', trip_id)
      .single<TripRow>()

    if (tripErr || !trip) {
      console.error('Trip fetch error:', tripErr?.message ?? 'no data', { trip_id })
      return err(`Viagem não encontrada para o UUID ${trip_id.slice(0, 8)}…. Verifique se a viagem existe e se o service role tem acesso.`)
    }

    // Fetch driver name from profiles (driver_name is not stored in trips)
    let driverName: string | null = null
    if (trip.driver_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome')
        .eq('id', trip.driver_id)
        .single()
      driverName = profile?.nome ?? null
    }

    if (!trip.pdf_path) return err('Gere o PDF da viagem antes de enviar por WhatsApp.')

    // PDF public URL
    const { data: urlData } = supabase.storage
      .from('trip-documents')
      .getPublicUrl(trip.pdf_path)
    const pdfUrl = urlData?.publicUrl
    if (!pdfUrl) return err('Não foi possível obter a URL do PDF.')

    // Build recipient list
    const recipients: Recipient[] = []
    const failedInvalid: { phone: string; reason: string }[] = []

    for (const r of manual_recipients ?? []) {
      const normalized = normalizePhone(r.phone)
      if (!normalized || !isValidBrazilPhone(normalized)) {
        failedInvalid.push({ phone: r.phone, reason: 'Número inválido' })
        continue
      }
      recipients.push({
        phone: normalized,
        name: r.name?.trim() || 'Destinatário manual',
        kind: 'manual',
      })
    }

    if (recipients.length === 0) {
      return err('Nenhum número válido para envio.')
    }

    const results = { sent: 0, failed: failedInvalid.length, error: null as string | null }
    const sendRecords = []
    const caption = buildCaption(trip, driverName, extra_message)

    for (const recipient of recipients) {
      let status = 'failed'
      let errorMessage: string | undefined
      let evolutionMessageId: string | undefined

      try {
        const res = await fetch(
          `${baseUrl}/message/sendMedia/${EVOLUTION_INSTANCE}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({
              number: recipient.phone,
              mediatype: 'document',
              media: pdfUrl,
              fileName: `Viagem_${trip.protocolo}.pdf`,
              caption,
            }),
          },
        )

        if (res.ok) {
          const evData = await res.json()
          evolutionMessageId = evData?.key?.id ?? evData?.id ?? undefined
          status = 'sent'
          results.sent++
        } else {
          const errText = await res.text()
          errorMessage = `Evolution API ${res.status}: ${errText.slice(0, 300)}`
          console.error('Evolution API error:', res.status, errText.slice(0, 500))
          results.failed++
          if (!results.error) results.error = errorMessage
        }
      } catch (fetchErr) {
        errorMessage = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        console.error('Evolution fetch error:', errorMessage)
        results.failed++
        if (!results.error) results.error = `Não foi possível conectar com a Evolution API: ${errorMessage}`
      }

      sendRecords.push({
        trip_id,
        sent_by: user.id,
        recipient_name: recipient.name,
        recipient_phone: recipient.phone,
        recipient_kind: recipient.kind,
        status,
        error_message: errorMessage ?? null,
        evolution_message_id: evolutionMessageId ?? null,
        extra_message: extra_message ?? null,
      })
    }

    if (sendRecords.length > 0) {
      await supabase.from('whatsapp_sends').insert(sendRecords)
    }

    return ok({ sent: results.sent, failed: results.failed, error: results.error, pdfUrl })
  } catch (e) {
    console.error('send-trip-whatsapp unhandled error:', e)
    return err(e instanceof Error ? e.message : 'Erro interno na Edge Function.')
  }
})
