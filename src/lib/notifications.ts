interface NotifyOptions {
  title: string
  body: string
  icon?: string
  tag?: string
  onClick: () => void
  onClose?: () => void
  onError?: () => void
}

/**
 * Type-safe notification wrapper. Forces callers to provide an onClick handler
 * so the OS "Activate" action always does something meaningful.
 */
export function notify(options: NotifyOptions): Notification | null {
  if (!('Notification' in window) || Notification.permission !== 'granted') return null

  const n = new Notification(options.title, {
    body: options.body,
    icon: options.icon ?? '/favicon.ico',
    tag: options.tag,
  })

  n.onclick = () => {
    window.focus()
    options.onClick()
    n.close()
  }

  if (options.onClose) n.onclose = options.onClose
  if (options.onError) n.onerror = options.onError

  return n
}
