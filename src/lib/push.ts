// Web Push (PWA). iOS 16.4+: só funciona na PWA instalada na tela inicial.
import { supabase } from './supabase'
import { getCurrentUser } from './repo'

// Chave pública VAPID (pode ficar no bundle — não é segredo). A privada fica só
// na Edge Function (secret). Override opcional por env.
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BE6zfkvMLsvjPS9oLgVXGtmYFkT9pjrOEr0cO9urYrYnuUpfCTCmTxeTWIoIUU1E6ZsC78jf1swWl2IKe_rNa8A'

/** Suporte a Web Push neste navegador/dispositivo. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Estado atual da permissão de notificação. */
export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

/** Já existe uma assinatura ativa neste dispositivo? */
export async function pushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  return !!(await reg.pushManager.getSubscription())
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/** Pede permissão, assina o push e salva a assinatura no Supabase. */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Seu dispositivo não suporta notificações aqui.' }
  if (!supabase) return { ok: false, error: 'Disponível só na versão conectada (não na demonstração).' }

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, error: 'Permissão de notificação não concedida.' }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_email: (getCurrentUser()?.email ?? '').toLowerCase(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Cancela a assinatura neste dispositivo e remove do servidor. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Dispara um envio (Edge Function). Só o admin pode chamar. */
export async function sendPush(toEmail: string, title: string, body: string, url = '/') {
  if (!supabase) return { ok: false, error: 'Indisponível na demonstração.' }
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: { toEmail: toEmail.toLowerCase(), title, body, url },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, ...(data ?? {}) }
}
