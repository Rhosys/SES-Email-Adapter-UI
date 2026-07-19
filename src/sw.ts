/// <reference lib="webworker" />
// Hand-written service worker (injectManifest strategy — see vite.config.ts).
// Precache/offline-fallback behavior mirrors what generateSW used to configure
// automatically; the addition here is notificationclick, which only a SW can
// handle (see src/lib/notifications.ts for why this replaced generateSW).

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & {
  // Injected by the injectManifest build step — the precache manifest.
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Same-origin SPA fallback for the app shell (excludes /api-shaped and asset
// requests the same way generateSW's navigateFallback did, by only handling
// navigation requests — Workbox's NavigationRoute is scoped to those already).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

interface NotifyClickData {
  /** Navigation target when the notification body (not an action) is clicked. */
  url?: string
  /** Per-action-id navigation targets; an action without an entry here just closes the notification. */
  actionUrls?: Record<string, string>
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const data = (event.notification.data ?? {}) as NotifyClickData
  const url = event.action ? data.actionUrls?.[event.action] : data.url
  event.notification.close()
  if (!url) return

  event.waitUntil(
    (async () => {
      // Focusing an already-open window (rather than always opening a new one)
      // is what makes this "PWA-first": clicking a notification brings the
      // installed app to the front instead of spawning a browser tab.
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const target = allClients.find((c): c is WindowClient => 'focus' in c)
      if (target) {
        // postMessage first: focus() can reject (e.g. without genuine user
        // activation) and must never block delivering the navigation target.
        target.postMessage({ type: 'notification-navigate', url })
        await target.focus().catch(() => {})
      } else {
        // self.registration.scope already reflects the deployed base path
        // (e.g. https://host/pr/<slug>/), so this resolves correctly wherever
        // this build is deployed without needing VITE_BASE_PATH here.
        await self.clients.openWindow(new URL(url.replace(/^\//, ''), self.registration.scope).toString())
      }
    })(),
  )
})
