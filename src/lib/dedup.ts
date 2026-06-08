import type { Signal } from '@/types/server'
import { isInboundEmailSignal } from '@/lib/signal-guards'

function djb2(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    hash = hash >>> 0
  }
  return hash.toString(36)
}

function normalizeBody(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function bodyFingerprint(signal: Signal): string | null {
  if (!isInboundEmailSignal(signal)) return null
  const { body } = signal.data
  if (!body) return null
  return djb2(normalizeBody(body))
}

function getLinkedSignalId(signal: Signal): string | null {
  if (
    signal.type === 'deliverability' ||
    signal.type === 'calendar_event' ||
    signal.type === 'calendar_response' ||
    signal.type === 'calendar_invite_invalid' ||
    signal.type === 'domain_misconfiguration'
  ) {
    return signal.data.linkedSignalId
  }
  return null
}

export interface SignalGroup {
  signal: Signal
  duplicates: Signal[]
  linkedSignal?: Signal
}

// Groups signals by body fingerprint (inbound email only). Signals are expected
// newest-first; the first occurrence in each group is shown, older copies go
// into duplicates[].
export function groupByBodyFingerprint(signals: Signal[]): SignalGroup[] {
  const groups = new Map<string, SignalGroup>()
  const order: string[] = []

  for (const signal of signals) {
    const key = bodyFingerprint(signal) ?? `__${signal.signalId}`
    if (groups.has(key)) {
      groups.get(key)!.duplicates.push(signal)
    } else {
      groups.set(key, { signal, duplicates: [] })
      order.push(key)
    }
  }

  return order.map((k) => groups.get(k)!)
}

// Resolves linkedSignalId references into inline linkedSignal fields, and
// removes the absorbed (linked-to) signals from the top-level list so they
// only appear inline inside their parent card.
export function attachLinkedSignals(groups: SignalGroup[]): SignalGroup[] {
  const byId = new Map<string, Signal>()
  for (const g of groups) byId.set(g.signal.signalId, g.signal)

  const absorbed = new Set<string>()
  for (const g of groups) {
    const id = getLinkedSignalId(g.signal)
    if (id) absorbed.add(id)
  }

  return groups
    .filter((g) => !absorbed.has(g.signal.signalId))
    .map((g) => {
      const id = getLinkedSignalId(g.signal)
      if (!id) return g
      const linked = byId.get(id)
      return linked ? { ...g, linkedSignal: linked } : g
    })
}
