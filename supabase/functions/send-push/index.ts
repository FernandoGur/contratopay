// ============================================================================
// Edge Function: send-push
// Envia uma notificação Web Push para todas as assinaturas de um e-mail.
// Só o admin (app_admins) pode chamar. Usa VAPID (segredos da função).
//
// Secrets necessários (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@dominio)
//
// Deploy:
//   supabase functions deploy send-push --project-ref zdlmdjafjaqcolagptlf
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

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

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@contratopay.com.br'

  // 1) Confirma que quem chama é admin.
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user?.email) return json(401, { error: 'Não autenticado.' })
  const { data: admin } = await caller.from('app_admins').select('email').ilike('email', user.email).maybeSingle()
  if (!admin) return json(403, { error: 'Apenas o vendedor (admin) pode enviar.' })

  // 2) Payload.
  let payload: { toEmail?: string; title?: string; body?: string; url?: string }
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'Corpo inválido.' })
  }
  const toEmail = (payload.toEmail ?? '').trim().toLowerCase()
  if (!toEmail) return json(400, { error: 'Informe o e-mail de destino.' })

  // 3) Busca as assinaturas (service role) e envia.
  const adminApi = createClient(url, service)
  const { data: subs, error } = await adminApi
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_email', toEmail)
  if (error) return json(500, { error: error.message })
  if (!subs || subs.length === 0) return json(200, { ok: true, sent: 0, note: 'Sem assinaturas para esse e-mail.' })

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  const notif = JSON.stringify({
    title: payload.title ?? 'ContratoPay',
    body: payload.body ?? '',
    url: payload.url ?? '/',
  })

  let sent = 0
  for (const s of subs) {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }
    try {
      await webpush.sendNotification(subscription, notif)
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      // Assinatura expirada/inválida → remove.
      if (code === 404 || code === 410) {
        await adminApi.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }
  }
  return json(200, { ok: true, sent, total: subs.length })
})
