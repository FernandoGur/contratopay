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
}

// Recebe o push e mostra a notificação.
self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = (event.data?.json() as PushPayload) ?? {}
  } catch {
    if (event.data) data = { body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'ContratoPay', {
      body: data.body || '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  )
})

// Clicar na notificação foca/abre o app na URL indicada.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          void client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
