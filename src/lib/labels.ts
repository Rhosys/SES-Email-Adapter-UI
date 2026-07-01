import type { Label } from '@/types/server'

// system:workflow:* labels duplicate the workflow badge shown alongside a thread — hide them from label chips.
export function visibleLabels(labels: string[]): string[] {
  return labels.filter((l) => !l.startsWith('system:workflow:'))
}

// Resolves a label key (e.g. "lbl_6") to its user-defined name/color. Returns
// null for keys with no matching Label record (e.g. system:* labels), so
// callers can fall back to the raw key with neutral styling.
export function findLabelMeta(items: Label[], key: string): { name: string; color: string } | null {
  const found = items.find((l) => l.label === key)
  return found ? { name: found.name, color: found.color ?? '#cba6f7' } : null
}
