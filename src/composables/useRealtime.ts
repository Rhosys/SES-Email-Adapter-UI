import { watch } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { useSignalsStore } from '@/stores/signals'
import { loginClient } from '@/lib/auth'
import type { ArcUrgency } from '@/types/server'
import type { RealtimeEvent, SignalCreatedEvent } from '@/types/realtime'

// Module-level singleton — one SharedWorker port for the whole page lifetime.
let worker: SharedWorker | null = null

// critical / high / normal → notify; low / silent → skip
function shouldNotify(urgency: ArcUrgency): boolean {
  return urgency !== 'low' && urgency !== 'silent'
}

function notifTitle(urgency: ArcUrgency): string {
  if (urgency === 'critical') return '🚨 Critical email'
  if (urgency === 'high') return '⚠️ High priority email'
  return 'New email'
}

function fireNotification(event: SignalCreatedEvent) {
  if (typeof window === 'undefined') return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (!shouldNotify(event.urgency)) return
  try {
    new Notification(notifTitle(event.urgency), {
      body: `From: ${event.from.name ?? event.from.address}\n${event.subject}`,
      icon: '/favicon.ico',
      tag: event.arcId, // collapses duplicate OS notifications for the same arc
    })
  } catch {
    // Blocked at OS level even with permission granted
  }
}

export function useRealtime() {
  const accountStore = useAccountStore()
  const arcsStore = useArcsStore()
  const signalsStore = useSignalsStore()

  function handleEvent(event: RealtimeEvent) {
    switch (event.type) {
      case 'signal:created':
        // Update the arc in the inbox list
        void arcsStore.refreshArc(event.arcId)
        // If the detail view for this arc is open, pull the updated arc + its signals
        if (signalsStore.arc?.arcId === event.arcId) {
          void signalsStore.fetchAll(event.arcId)
        }
        fireNotification(event)
        break
      case 'arc:updated':
        // Update just this arc in the inbox list
        void arcsStore.refreshArc(event.arcId)
        // If the detail view for this arc is open, refresh it too
        if (signalsStore.arc?.arcId === event.arcId) {
          void signalsStore.fetchAll(event.arcId)
        }
        break
    }
  }

  async function init(accountId: string) {
    let token = ''
    try {
      token = (await loginClient.ensureToken()) ?? ''
    } catch {
      // token stays empty; server may reject — worker will retry on reconnect
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
