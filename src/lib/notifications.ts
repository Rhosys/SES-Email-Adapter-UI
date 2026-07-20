// Notifications always go through the active service worker's registration
// (never `new Notification()`), because actions and click routing — the
// hard requirements here — are Notification-API features that only exist on
// ServiceWorkerRegistration.showNotification(); a page-constructed
// Notification supports neither. That also removes the old "Illegal
// constructor" fallback this file used to need on Chrome for Android — there
// is no longer a constructor path to fall back from.
//
// Click handling likewise can't be a JS callback on the page anymore (a
// notification shown via the registration has no client-side object to
// attach .onclick to) — it's handled by the service worker's own
// `notificationclick` listener (src/sw.ts), driven by the `url` values below
// via `event.notification.data`.

const DEFAULT_ICON = `${import.meta.env.BASE_URL}pwa-192x192.png`
const DEFAULT_BADGE = `${import.meta.env.BASE_URL}notification-badge.png`

export interface NotifyAction {
  /** Matched against event.action in the service worker's notificationclick handler. */
  action: string
  title: string
  /** Navigation target when this action is clicked. Omit for a dismiss-only action. */
  url?: string
}

export interface NotifyOptions {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  /** Navigation target when the notification body (not an action button) is clicked. */
  url?: string
  /**
   * Up to 2 buttons on the notification itself (platform-dependent — Android
   * and desktop Chrome/Firefox/Edge support them, iOS never does; browsers
   * that don't will just ignore this and show a plain notification).
   */
  actions?: NotifyAction[]
}

/** Shows a notification via the service worker registration. No-ops if permission isn't granted. */
export async function notify(options: NotifyOptions): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (!('serviceWorker' in navigator)) return

  const actionUrls = options.actions?.reduce<Record<string, string>>((acc, a) => {
    if (a.url) acc[a.action] = a.url
    return acc
  }, {})

  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(options.title, {
    body: options.body,
    icon: options.icon ?? DEFAULT_ICON,
    badge: options.badge ?? DEFAULT_BADGE,
    tag: options.tag,
    actions: options.actions?.map(({ action, title }) => ({ action, title })),
    data: { url: options.url, actionUrls },
  } as NotificationOptions)
}
