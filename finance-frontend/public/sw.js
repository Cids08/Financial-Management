/*
 * Financial Management System - push notification service worker.
 *
 * Registered from main.jsx. Receives Web Push messages sent by the backend
 * (NotificationService -> WebPushService) and renders them as OS-level
 * toast notifications, even when the app tab is in the background.
 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = null
  try {
    payload = event.data.json()
  } catch {
    payload = { title: event.data.text() }
  }

  const title = payload.title || 'Financial Management System'
  const options = {
    body: payload.body || '',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    tag: payload.tag || undefined,
    data: payload.data || {},
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const relativeUrl = (event.notification.data && event.notification.data.url) || '/notifications'
  const targetUrl = new URL(relativeUrl, self.location.origin).href

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })()
  )
})