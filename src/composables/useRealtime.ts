import { watch } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { useQuarantineStore } from '@/stores/quarantine'
import { useRulesStore } from '@/stores/rules'
import { loginClient } from '@/lib/auth'
import type { ArcUrgency } from '@/types/server'
import type { RealtimeEvent } from '@/types/realtime'

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

function fireNotification(event: RealtimeEvent) {
  if (typeof window === 'undefined') return
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  // Only signal:created and arc:created carry enough info for a useful notification
  if (event.type !== 'signal:created' && event.type !== 'arc:created') return
  if (!shouldNotify(event.urgency)) return

  const body =
    event.type === 'signal:created'
      ? `From: ${event.from.name ?? event.from.address}\n${event.subject}`
      : event.summary

  try {
    new Notification(notifTitle(event.urgency), {
      body,
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
  const quarantineStore = useQuarantineStore()
  const rulesStore = useRulesStore()

  function handleEvent(event: RealtimeEvent) {
    switch (event.type) {
      case 'arc:created':
      case 'arc:updated':
      case 'arc:archived':
      case 'signal:created':
      case 'signal:updated':
        void arcsStore.fetchArcs(true)
        fireNotification(event)
        break
      case 'quarantine:created':
        void quarantineStore.fetchSignals(true)
        break
      case 'rule:created':
      case 'rule:updated':
      case 'rule:deleted':
        void rulesStore.fetchRules()
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
