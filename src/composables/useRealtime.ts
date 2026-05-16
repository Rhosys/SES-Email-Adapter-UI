import { watch } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { useQuarantineStore } from '@/stores/quarantine'
import { useRulesStore } from '@/stores/rules'
import { loginClient } from '@/lib/auth'

// Module-level singleton — one SharedWorker port for the whole page lifetime.
let worker: SharedWorker | null = null

export function useRealtime() {
  const accountStore = useAccountStore()
  const arcsStore = useArcsStore()
  const quarantineStore = useQuarantineStore()
  const rulesStore = useRulesStore()

  function handleEvent(data: { type: string }) {
    const { type } = data
    if (type.startsWith('arc:') || type.startsWith('signal:')) {
      void arcsStore.fetchArcs(true)
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
        const msg = e.data as { type: string; data?: { type: string } }
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
