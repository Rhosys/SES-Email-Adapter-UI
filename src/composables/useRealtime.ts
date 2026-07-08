import { watch } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useThreadsStore } from '@/stores/threads'
import { useSignalsStore } from '@/stores/signals'
import { loginClient } from '@/lib/auth'
import { showNotification } from '@/lib/notifications'
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
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (!shouldNotify(event.urgency)) return
  showNotification(notifTitle(event.urgency), {
    body: `From: ${event.from.name ?? event.from.address}\n${event.subject}`,
    icon: '/favicon.ico',
    tag: event.threadId, // collapses duplicate OS notifications for the same thread
  })
}

export function useRealtime() {
  const accountStore = useAccountStore()
  const threadsStore = useThreadsStore()
  const signalsStore = useSignalsStore()

  function handleEvent(event: RealtimeEvent) {
    switch (event.type) {
      case 'signal:created':
        // Update the thread in the inbox list
        void threadsStore.refreshThread(event.threadId)
        // If the detail view for this thread is open, pull the updated signals
        if (signalsStore.currentThreadId === event.threadId) {
          void signalsStore.fetchAll(event.threadId)
        }
        fireNotification(event)
        break
      case 'thread:updated':
        // Update just this thread in the inbox list
        void threadsStore.refreshThread(event.threadId)
        // If the detail view for this thread is open, refresh it too
        if (signalsStore.currentThreadId === event.threadId) {
          void signalsStore.fetchAll(event.threadId)
        }
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
        const msg = e.data as { type: string; data?: RealtimeEvent }
        if (msg.type === 'event' && msg.data) handleEvent(msg.data)
      }
      worker.port.start()
    }

    worker.port.postMessage({ type: 'init', accountId, token })
  }

  watch(
    () => accountStore.accountId,
    (id) => { if (id) void init(id) },
    { immediate: true },
  )
}
