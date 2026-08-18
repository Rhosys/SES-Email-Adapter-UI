import { watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { queryKeys } from '@/lib/queryKeys'
import { loginClient } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import logger from '@/lib/logger'
import type { ThreadUrgency } from '@/types/server'
import type { RealtimeEvent, SignalCreatedEvent } from '@/types/realtime'

// Module-level singleton — one SharedWorker port for the whole page lifetime.
let worker: SharedWorker | null = null

// critical / high / normal → notify; low / silent → skip
function shouldNotify(urgency: ThreadUrgency): boolean {
  return urgency !== 'low' && urgency !== 'silent'
}

function notifTitle(urgency: ThreadUrgency): string {
  if (urgency === 'critical') return '🚨 Critical email'
  if (urgency === 'high') return '⚠️ High priority email'
  return 'New email'
}

function fireNotification(event: SignalCreatedEvent) {
  if (typeof window === 'undefined') return
  if (!shouldNotify(event.urgency)) return
  void notify({
    title: notifTitle(event.urgency),
    body: `From: ${event.from.name ?? event.from.address}\n${event.subject}`,
    tag: event.threadId, // collapses duplicate OS notifications for the same thread
    url: `/threads/${event.threadId}`,
  })
}

export function useRealtime() {
  const accountStore = useAccountStore()
  const queryClient = useQueryClient()

  function handleEvent(event: RealtimeEvent) {
    const accountId = accountStore.accountId
    if (!accountId) return

    switch (event.type) {
      case 'thread:updated':
        void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all(accountId) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(accountId, event.threadId) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.signals.byThread(accountId, event.threadId) })
        if ('urgency' in event) fireNotification(event)
        break
    }
  }

  async function init(accountId: string) {
    let token = ''
    try {
      token = (await loginClient.ensureToken()) ?? ''
    } catch (e) {
      // token stays empty; server may reject — worker will retry on reconnect
      logger.warn({ title: 'Realtime: failed to acquire token', error: e })
    }

    if (!worker) {
      worker = new SharedWorker(
        new URL('../workers/realtime.shared.ts', import.meta.url),
        { type: 'module', name: 'ses-realtime' },
      )
      worker.port.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: string; connected?: boolean; data?: RealtimeEvent }
        if (msg.type === 'status') {
          logger.info({ title: 'Realtime: connection status', connected: msg.connected })
        } else if (msg.type === 'event' && msg.data) {
          logger.info({ title: 'Realtime: event received', eventType: msg.data.type, data: msg.data })
          handleEvent(msg.data)
        }
      }
      worker.port.start()
    }

    logger.info({ title: 'Realtime: activating websocket', accountId })
    worker.port.postMessage({ type: 'init', accountId, token })
  }

  watch(
    () => accountStore.accountId,
    (id) => { if (id) void init(id) },
    { immediate: true },
  )
}
