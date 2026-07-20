import { describe, it, expect, vi, afterEach } from 'vitest'
import { notify } from '@/lib/notifications'

function mockNotificationPermission(permission: NotificationPermission) {
  vi.stubGlobal('Notification', { permission })
}

function mockServiceWorker() {
  const showNotification = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: { ready: Promise.resolve({ showNotification }) },
  })
  return showNotification
}

describe('notify', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does nothing when the Notification API is unavailable', async () => {
    // jsdom doesn't define window.Notification by default — `in` must see a
    // truly absent key (a stub set to `undefined` still counts as present).
    const showNotification = mockServiceWorker()
    await notify({ title: 't', body: 'b' })
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does nothing when permission is not granted', async () => {
    mockNotificationPermission('default')
    const showNotification = mockServiceWorker()
    await notify({ title: 't', body: 'b' })
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does nothing when there is no service worker support', async () => {
    mockNotificationPermission('granted')
    const { serviceWorker: _omit, ...navigatorWithoutSw } = navigator as Navigator & { serviceWorker?: unknown }
    vi.stubGlobal('navigator', navigatorWithoutSw)
    await expect(notify({ title: 't', body: 'b' })).resolves.toBeUndefined()
  })

  it('shows via the service worker registration with default icon/badge and the url in data', async () => {
    mockNotificationPermission('granted')
    const showNotification = mockServiceWorker()
    await notify({ title: 'New email', body: 'From: someone', url: '/threads/abc123' })

    expect(showNotification).toHaveBeenCalledTimes(1)
    const [title, options] = showNotification.mock.calls[0]
    expect(title).toBe('New email')
    expect(options.body).toBe('From: someone')
    expect(options.icon).toContain('pwa-192x192.png')
    expect(options.badge).toContain('notification-badge.png')
    // No actions passed — actionUrls is left undefined (harmless: the service
    // worker reads it with optional chaining) rather than forced to {}.
    expect(options.data).toEqual({ url: '/threads/abc123', actionUrls: undefined })
  })

  it('builds actionUrls only for actions that have a url, and passes action/title pairs', async () => {
    mockNotificationPermission('granted')
    const showNotification = mockServiceWorker()
    await notify({
      title: 't',
      body: 'b',
      url: '/settings',
      actions: [
        { action: 'open-settings', title: 'Open Settings', url: '/settings?tab=email-forwarding' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })

    const [, options] = showNotification.mock.calls[0]
    expect(options.actions).toEqual([
      { action: 'open-settings', title: 'Open Settings' },
      { action: 'dismiss', title: 'Dismiss' },
    ])
    expect(options.data.actionUrls).toEqual({ 'open-settings': '/settings?tab=email-forwarding' })
  })

  it('respects a custom icon/badge/tag when provided', async () => {
    mockNotificationPermission('granted')
    const showNotification = mockServiceWorker()
    await notify({ title: 't', body: 'b', icon: '/custom-icon.png', badge: '/custom-badge.png', tag: 'thread-1' })

    const [, options] = showNotification.mock.calls[0]
    expect(options.icon).toBe('/custom-icon.png')
    expect(options.badge).toBe('/custom-badge.png')
    expect(options.tag).toBe('thread-1')
  })
})
