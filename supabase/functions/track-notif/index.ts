// ============================================================================
// Edge Function: track-notif
// Recebe do service worker o evento de entrega/clique de uma notificação e
// carimba a data no notification_log. SEM verificação de JWT — a autorização é
// o próprio `nid` (uuid difícil de adivinhar). Deploy com --no-verify-jwt.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'método não permitido' })

  let payload: { nid?: string; event?: string }
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'corpo inválido' })
  }
  const nid = (payload.nid ?? '').trim()
  const event = payload.event === 'clicked' ? 'clicked' : payload.event === 'delivered' ? 'delivered' : ''
  if (!nid || !event) return json(400, { error: 'nid/event ausentes' })

  const adminApi = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const patch = event === 'clicked' ? { clicked_at: new Date().toISOString() } : { delivered_at: new Date().toISOString() }
  // Só carimba se ainda estiver vazio (primeira ocorrência).
  const col = event === 'clicked' ? 'clicked_at' : 'delivered_at'
  const { error } = await adminApi.from('notification_log').update(patch).eq('id', nid).is(col, null)
  if (error) return json(500, { error: error.message })
  return json(200, { ok: true })
})
