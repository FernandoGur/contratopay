/// <reference lib="webworker" />
// Service worker do ContratoPay — precache do app-shell (Workbox) + Web Push.
// Compilado pelo vite/esbuild (fora do typecheck do tsc — ver tsconfig exclude).
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

// Atualização automática (autoUpdate): assume o controle assim que instala.
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
// O literal `self.__WB_MANIFEST` é substituído pela lista de precache no build.
precacheAndRoute(self.__WB_MANIFEST)

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
  // Rastreamento: id do log + endpoint/chave para reportar entrega/clique.
  nid?: string
  trackUrl?: string
  apikey?: string
}

// Reporta um evento ('delivered' | 'clicked') ao endpoint de rastreamento.
function track(data: PushPayload, event: 'delivered' | 'clicked'): Promise<unknown> {
  if (!data.nid || !data.trackUrl) return Promise.resolve()
  return fetch(data.trackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(data.apikey ? { apikey: data.apikey, Authorization: `Bearer ${data.apikey}` } : {}),
    },
    body: JSON.stringify({ nid: data.nid, event }),
  }).catch(() => undefined)
}

// Recebe o push, mostra a notificação e reporta a entrega.
self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = (event.data?.json() as PushPayload) ?? {}
  } catch {
    if (event.data) data = { body: event.data.text() }
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'ContratoPay', {
        body: data.body || '',
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
        tag: data.tag,
        data,
      }),
      track(data, 'delivered'),
    ]),
  )
})

// Clicar na notificação foca/abre o app na URL e reporta o clique.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = (event.notification.data as PushPayload | undefined) ?? {}
  const url = data.url || '/'
  event.waitUntil(
    Promise.all([
      track(data, 'clicked'),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const client of list) {
          if ('focus' in client) {
            void client.navigate(url)
            return client.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
    ]),
  )
})
