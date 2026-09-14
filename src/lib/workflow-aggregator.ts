import type { WorkflowData, Workflow } from "@/types/server"
import type { SignalGroup } from "@/lib/dedup"
import { isInboundEmailSignal } from "@/lib/signal-guards"

export interface WorkflowGroup {
  workflow: Workflow
  entries: WorkflowData[] // newest first, deduped + merged
}

interface ExtractedEntry {
  data: WorkflowData
  workflow: Workflow
  signalIndex: number
}

function canonicalize(data: WorkflowData): string {
  const clean = Object.fromEntries(
    Object.entries(data)
      .filter(([, v]) => v != null)
      .sort(([a], [b]) => a.localeCompare(b))
  )
  return JSON.stringify(clean)
}

// Case-invariant containment: two strings are compatible when one contains the
// other (e.g. "AWS Community Day" ⊂ "AWS Community Day 2026 - Switzerland"). This
// lets a truncated/partial value merge with its fuller counterpart.
function isSubstringMatch(a: string, b: string): boolean {
  const la = a.toLowerCase()
  const lb = b.toLowerCase()
  return la.includes(lb) || lb.includes(la)
}

// Fields that vary per notification about the same underlying subject and must
// never gate a merge. For events, both the lifecycle stage (`eventType`) and the
// free-text `description` change across confirmation/update/reminder emails while
// still describing one event, so they are ignored for compatibility and simply
// resolved newest-wins during the merge itself.
const VOLATILE_FIELDS: Partial<Record<Workflow, readonly string[]>> = {
  events: ["eventType", "description"],
}

// Identity fields whose presence + match is REQUIRED (not merely non-conflicting)
// for two entries to be considered the same subject. Prevents two unrelated events
// merging just because none of their sparse fields happen to conflict.
const IDENTITY_FIELDS: Partial<Record<Workflow, readonly string[]>> = {
  events: ["eventName"],
}

function areMergeCompatible(workflow: Workflow, a: WorkflowData, b: WorkflowData): boolean {
  const ra = a as unknown as Record<string, unknown>
  const rb = b as unknown as Record<string, unknown>
  const volatile = new Set(VOLATILE_FIELDS[workflow] ?? [])

  for (const field of IDENTITY_FIELDS[workflow] ?? []) {
    const va = ra[field]
    const vb = rb[field]
    if (typeof va !== "string" || typeof vb !== "string") return false
    if (!isSubstringMatch(va, vb)) return false
  }

  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (volatile.has(key)) continue
    const va = ra[key]
    const vb = rb[key]
    if (va != null && vb != null && JSON.stringify(va) !== JSON.stringify(vb)) {
      if (typeof va === "string" && typeof vb === "string" && isSubstringMatch(va, vb)) continue
      return false
    }
  }
  return true
}

function mergeEntries(older: WorkflowData, newer: WorkflowData): WorkflowData {
  const ro = older as unknown as Record<string, unknown>
  const rn = newer as unknown as Record<string, unknown>
  const merged: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(older), ...Object.keys(newer)])) {
    const vo = ro[key]
    const vn = rn[key]
    if (typeof vo === "string" && typeof vn === "string" && vo !== vn) {
      merged[key] = vo.length > vn.length ? vo : vn
    } else {
      merged[key] = vn ?? vo
    }
  }
  return merged as unknown as WorkflowData
}

export function aggregateWorkflowPanels(dedupedSignals: SignalGroup[]): WorkflowGroup[] {
  // 1. Extract up to 10 qualifying entries
  const extracted: ExtractedEntry[] = []
  for (let i = 0; i < dedupedSignals.length && extracted.length < 10; i++) {
    const group = dedupedSignals[i]
    if (!isInboundEmailSignal(group.signal)) continue
    const { workflow, workflowData: wd } = group.signal.data
    if (!wd || !workflow) continue
    extracted.push({ data: wd, workflow, signalIndex: i })
  }

  // 2. Group by workflow type, track newest signal index per group
  const buckets = new Map<Workflow, { entries: ExtractedEntry[]; newestIndex: number }>()
  for (const entry of extracted) {
    const key = entry.workflow
    const existing = buckets.get(key)
    if (existing) {
      existing.entries.push(entry)
      existing.newestIndex = Math.min(existing.newestIndex, entry.signalIndex)
    } else {
      buckets.set(key, { entries: [entry], newestIndex: entry.signalIndex })
    }
  }

  // 3. Deduplicate by content-equality within each bucket
  for (const bucket of buckets.values()) {
    const seen = new Set<string>()
    const deduped: ExtractedEntry[] = []
    for (const entry of bucket.entries) {
      const canon = canonicalize(entry.data)
      if (!seen.has(canon)) {
        seen.add(canon)
        deduped.push(entry)
      }
    }
    bucket.entries = deduped
  }

  // 4. Merge-compatible consolidation (fixed-point)
  for (const bucket of buckets.values()) {
    let changed = true
    while (changed) {
      changed = false
      for (let i = 0; i < bucket.entries.length; i++) {
        for (let j = i + 1; j < bucket.entries.length; j++) {
          if (areMergeCompatible(bucket.entries[i].workflow, bucket.entries[i].data, bucket.entries[j].data)) {
            // i is newer (lower index in newest-first list), j is older
            // merge oldest-into-newest so newest values win
            bucket.entries[i] = {
              data: mergeEntries(bucket.entries[j].data, bucket.entries[i].data),
              workflow: bucket.entries[i].workflow,
              signalIndex: bucket.entries[i].signalIndex,
            }
            bucket.entries.splice(j, 1)
            changed = true
            break
          }
        }
        if (changed) break
      }
    }
  }

  // 5. Order groups by newest contributing signal index ascending, tie-break alphabetically
  const groups = [...buckets.entries()]
    .sort(([aKey, a], [bKey, b]) => {
      if (a.newestIndex !== b.newestIndex) return a.newestIndex - b.newestIndex
      return aKey.localeCompare(bKey)
    })
    .map(([key, bucket]): WorkflowGroup => ({
      workflow: key,
      entries: bucket.entries.map((e) => e.data),
    }))

  return groups
}
