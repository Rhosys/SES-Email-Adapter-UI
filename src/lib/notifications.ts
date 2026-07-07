interface NotifyOptions {
  title: string
  body: string
  icon?: string
  tag?: string
  onClick: () => void
  onClose?: () => void
  onError?: () => void
}

async function showViaServiceWorker(title: string, options: NotificationOptions): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(title, options)
}

/**
 * Shows a native notification. Chrome for Android (and some other mobile
 * browsers) throw "Illegal constructor" from `new Notification()` and require
 * going through the active service worker's registration instead, so fall
 * back to that when the constructor is rejected.
 */
export function showNotification(title: string, options: NotificationOptions): Notification | null {
  try {
    return new Notification(title, options)
  } catch {
    void showViaServiceWorker(title, options)
    return null
  }
}

/**
 * Type-safe notification wrapper. Forces callers to provide an onClick handler
 * so the OS "Activate" action always does something meaningful.
 */
export function notify(options: NotifyOptions): Notification | null {
  if (!('Notification' in window) || Notification.permission !== 'granted') return null

  const n = showNotification(options.title, {
    body: options.body,
    icon: options.icon ?? '/favicon.ico',
    tag: options.tag,
  })
  if (!n) return null

  n.onclick = () => {
    window.focus()
    options.onClick()
    n.close()
  }

  if (options.onClose) n.onclose = options.onClose
  if (options.onError) n.onerror = options.onError

  return n
}
