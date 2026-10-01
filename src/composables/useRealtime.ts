import { watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { queryKeys } from '@/lib/queryKeys'
import { loginClient } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import logger from '@/lib/logger'
import { api } from '@/lib/api'
import { upsertThreadCache } from '@/lib/threadCache'
import { useToast } from '@/composables/useToast'
import type { SignalStatus, ThreadUrgency } from '@/types/server'
import type { RealtimeEvent, SignalCreatedEvent, WorkerMessage } from '@/types/realtime'

// Module-level singleton — one SharedWorker port for the whole page lifetime.
let worker: SharedWorker | null = null
let tokenInterval: ReturnType<typeof setInterval> | null = null

// OS notification is interruptive — suppress for low/silent. In-app toast is ephemeral and only
// seen by a user already watching, so it fires for everything except silent (the explicit mute).
function shouldNotify(urgency: ThreadUrgency): boolean {
  return urgency !== 'low' && urgency !== 'silent'
}

function shouldToast(urgency: ThreadUrgency): boolean {
  return urgency !== 'silent'
}

const QUARANTINE_STATUSES: readonly SignalStatus[] = ['quarantine_visible', 'quarantine_hidden']

function isQuarantineStatus(status: SignalStatus | undefined): boolean {
  return status !== undefined && QUARANTINE_STATUSES.includes(status)
}

function notifTitle(urgency: ThreadUrgency): string {
  if (urgency === 'critical') return '🚨 Critical email'
  if (urgency === 'high') return '⚠️ High priority email'
  return 'New email'
}

async function fireNotification(event: SignalCreatedEvent): Promise<void> {
  if (typeof window === 'undefined') return
  if (!shouldNotify(event.urgency)) return
  const quarantined = isQuarantineStatus(event.status)
  const result = await notify({
    title: notifTitle(event.urgency),
    body: `From: ${event.from.name ?? event.from.address}\n${event.subject}`,
    tag: quarantined ? event.signalId : event.threadId,
    url: quarantined ? '/quarantine' : `/threads/${event.threadId}`,
  })
  if (result.isErr()) {
    logger.error({ title: 'Realtime: OS notification failed', error: result.error })
  }
}

export function useRealtime() {
  const accountStore = useAccountStore()
  const queryClient = useQueryClient()
  const toast = useToast()

  async function handleEvent(event: RealtimeEvent): Promise<void> {
    const accountId = accountStore.accountId
    if (!accountId) return

    switch (event.type) {
      case 'connected':
        logger.info({ title: 'Realtime: server confirmed connection', connectionId: event.connectionId, timestamp: event.timestamp })
        toast.notify('Live updates connected')
        break
      case 'thread:updated': {
        const signalEvent = 'urgency' in event ? event : undefined

        // A quarantined signal has no persisted thread, so the thread/signals caches don't apply.
        // The quarantine queues are filtered (sender/date), so a surgical insert can't know which
        // filter variants a new signal belongs to — invalidate the whole quarantine namespace and
        // let the mounted queries refetch.
        if (signalEvent && isQuarantineStatus(signalEvent.status)) {
          await queryClient.invalidateQueries({ queryKey: queryKeys.quarantine.all(accountId) })
          if (shouldToast(signalEvent.urgency)) toast.notify('New email in quarantine')
          await fireNotification(signalEvent)
          break
        }

        if (event.threadId === undefined) break

        const threadId = event.threadId
        // The event only carries IDs/summary fields, not the full Thread or its signals — those
        // still have to be fetched. Fetch directly and write the result into cache: a stale cache
        // the user isn't looking at is harmless; a wrong one is the thing worth avoiding, and a
        // direct write fixes that unconditionally. upsertThreadCache seeds both the thread's detail
        // entry and its row in every matching list page from the same fetch.
        const threadResult = await api.getThread(accountId, threadId)
        if (threadResult.isOk()) {
          upsertThreadCache(queryClient, accountId, threadResult.value)
        } else {
          logger.warn({ title: 'Realtime: thread fetch failed', threadId, error: threadResult.error })
        }

        // Signals aren't cached per-thread beyond one infinite-query page depth we know of here,
        // so replace the cached page(s) with a fresh first page rather than replaying cursors.
        const signalsResult = await api.listSignals(accountId, threadId, { limit: 50 })
        if (signalsResult.isOk()) {
          queryClient.setQueryData(queryKeys.signals.byThread(accountId, threadId), {
            pages: [signalsResult.value],
            pageParams: [undefined],
          })
        } else {
          logger.warn({ title: 'Realtime: signals fetch failed', threadId, error: signalsResult.error })
        }

        if (signalEvent) {
          if (shouldToast(signalEvent.urgency)) {
            toast.notify(`New email from ${signalEvent.from.name ?? signalEvent.from.address}`)
          }
          await fireNotification(signalEvent)
        }
        break
      }
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
        const msg = e.data as WorkerMessage
        if (msg.type === 'unconfirmed') {
          logger.warn({ title: 'Realtime: no reply to ping after socket opened' })
          toast.notify('Live updates not confirmed', 4000)
        } else if (msg.type === 'status') {
          if (msg.connected) {
            logger.info({ title: 'Realtime: connected' })
          } else {
            logger.info({ title: 'Realtime: disconnected', code: msg.code, reason: msg.reason, wasClean: msg.wasClean, hint: msg.hint })
          }
        } else if (msg.type === 'event') {
          logger.info({ title: 'Realtime: event received', eventType: msg.data.type, data: msg.data })
          handleEvent(msg.data).then(() => {}, (e) => logger.error({ title: 'Realtime: event handling failed', error: e }))
        }
      }
      worker.port.start()
    }

    logger.info({ title: 'Realtime: activating websocket', accountId })
    worker.port.postMessage({ type: 'init', accountId, token })

    // Push a fresh token to the worker every 30s so reconnects use a valid JWT
    if (!tokenInterval) {
      tokenInterval = setInterval(() => {
        loginClient.ensureToken().then(t => {
          if (t && worker) worker.port.postMessage({ type: 'token', token: t })
        }).catch(() => { /* token unavailable — worker keeps last known */ })
      }, 30_000)
    }
  }

  watch(
    () => accountStore.accountId,
    (id) => { if (id) void init(id) },
    { immediate: true },
  )
}
