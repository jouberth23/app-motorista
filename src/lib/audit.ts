import { supabase } from './supabase'

export async function logAudit(params: {
  entity: string
  entity_id: string
  action: string
  by_user: string
  diff?: Record<string, unknown>
}) {
  await supabase.from('audit_logs').insert({
    entity: params.entity,
    entity_id: params.entity_id,
    action: params.action,
    by_user: params.by_user,
    diff: params.diff ?? null,
  })
}
