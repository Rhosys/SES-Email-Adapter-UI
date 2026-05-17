import { watch } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { useQuarantineStore } from '@/stores/quarantine'
import { useRulesStore } from '@/stores/rules'
import { loginClient } from '@/lib/auth'
import type { ArcUrgency } from '@/types/server'

// Module-level singleton — one SharedWorker port for the whole page lifetime.
let worker: SharedWorker | null = null

// Shape the server may send alongside the event type
interface RealtimeEventPayload {
  type: string
  arc?: { id?: string; urgency?: ArcUrgency; summary?: string }
  signal?: { from?: { address?: string; name?: string }; subject?: string }
}

// urgency → minimum urgency required to notify, based on the user's email digest preference.
// critical/high always break through; normal only fires on instant; low/silent never fire.
function shouldNotify(
  urgency: ArcUrgency | undefined,
  frequency: 'instant' | 'hourly' | 'daily' | undefined,
): boolean {
  if (!urgency || urgency === 'silent' || urgency === 'low') return false
  if (frequency === 'daily') return urgency === 'critical'
  if (frequency === 'hourly') return urgency === 'critical' || urgency === 'high'
  return true // instant or unset: critical, high, normal all qualify
}

function notifTitle(urgency: ArcUrgency): string {
  if (urgency === 'critical') return '🚨 Critical email'
  if (urgency === 'high') return '⚠️ High priority email'
  return 'New email'
}

export function useRealtime() {
  const accountStore = useAccountStore()
  const arcsStore = useArcsStore()
  const quarantineStore = useQuarantineStore()
  const rulesStore = useRulesStore()

  function fireNotification(payload: RealtimeEventPayload) {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const urgency = payload.arc?.urgency
    const frequency = accountStore.account?.notifications?.email?.frequency
    if (!shouldNotify(urgency, frequency)) return

    const from =
      payload.signal?.from?.name ?? payload.signal?.from?.address ?? 'Unknown sender'
    const subject = payload.signal?.subject ?? payload.arc?.summary ?? 'New message'

    try {
      new Notification(notifTitle(urgency!), {
        body: `From: ${from}\n${subject}`,
        icon: '/favicon.ico',
        tag: payload.arc?.id, // collapses duplicate notifications for the same arc
      })
    } catch {
      // Blocked at OS level even with permission granted
    }
  }

  function handleEvent(data: RealtimeEventPayload) {
    const { type } = data
    if (type.startsWith('arc:') || type.startsWith('signal:')) {
      void arcsStore.fetchArcs(true)
      fireNotification(data)
    }
    if (type.startsWith('quarantine:')) {
      void quarantineStore.fetchSignals(true)
    }
    if (type.startsWith('rule:')) {
      void rulesStore.fetchRules()
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
        const msg = e.data as { type: string; data?: RealtimeEventPayload }
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
