import type {
  ConditionField,
  ConditionGroup,
  ConditionLeaf,
  ConditionOperator,
} from '@/types/server'

export function defaultLeaf(): ConditionLeaf {
  return { field: 'signal.from.address', operator: 'equals', value: '' }
}

export const FIELDS: { value: ConditionField; label: string }[] = [
  { value: 'signal.from.address', label: 'Sender address' },
  { value: 'signal.from.domain', label: 'Sender domain' },
  { value: 'signal.subject', label: 'Subject' },
  { value: 'signal.workflow', label: 'Workflow' },
  { value: 'signal.spamScore', label: 'Spam score' },
  { value: 'arc.labels', label: 'Labels' },
  { value: 'arc.urgency', label: 'Urgency' },
  { value: 'arc.status', label: 'Arc status' },
]

export const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
]

// ─── Serialization ────────────────────────────────────────────────────────────

export function leafToLogic(leaf: ConditionLeaf): unknown {
  const varRef = { var: leaf.field }
  const numVal = leaf.field === 'signal.spamScore' ? Number(leaf.value) : leaf.value
  switch (leaf.operator) {
    case 'equals':
      return { '==': [varRef, numVal] }
    case 'not_equals':
      return { '!=': [varRef, numVal] }
    case 'contains':
      return { in: [numVal, varRef] }
    case 'not_contains':
      return { '!': { in: [numVal, varRef] } }
    case 'starts_with':
      return { startsWith: [varRef, numVal] }
    case 'ends_with':
      return { endsWith: [varRef, numVal] }
    case 'greater_than':
      return { '>': [varRef, Number(leaf.value)] }
    case 'less_than':
      return { '<': [varRef, Number(leaf.value)] }
  }
}

export function groupToLogic(group: ConditionGroup): unknown {
  const parts = group.conditions.map(leafToLogic)
  return parts.length === 1 ? parts[0] : { [group.mode]: parts }
}

export function serializeCondition(groups: ConditionGroup[]): string {
  const parts = groups.map(groupToLogic)
  return JSON.stringify(parts.length === 1 ? parts[0] : { and: parts })
}

// ─── Deserialization ──────────────────────────────────────────────────────────

export function logicToGroups(condition: string): ConditionGroup[] {
  try {
    return parseTree(JSON.parse(condition) as unknown)
  } catch {
    return [{ mode: 'and', conditions: [defaultLeaf()] }]
  }
}

function parseTree(node: unknown): ConditionGroup[] {
  if (typeof node !== 'object' || !node) return [{ mode: 'and', conditions: [defaultLeaf()] }]
  const obj = node as Record<string, unknown>

  if ('and' in obj && Array.isArray(obj.and)) {
    const children = obj.and as unknown[]
    if (children.every(isLeafLike)) {
      const conds = children.map(parseLeaf).filter(Boolean) as ConditionLeaf[]
      return [{ mode: 'and', conditions: conds.length ? conds : [defaultLeaf()] }]
    }
    return children.map((child) => parseGroup(child, 'and'))
  }
  if ('or' in obj && Array.isArray(obj.or)) {
    const conds = (obj.or as unknown[]).map(parseLeaf).filter(Boolean) as ConditionLeaf[]
    return [{ mode: 'or', conditions: conds.length ? conds : [defaultLeaf()] }]
  }
  const leaf = parseLeaf(node)
  return [{ mode: 'and', conditions: leaf ? [leaf] : [defaultLeaf()] }]
}

function parseGroup(node: unknown, fallback: 'and' | 'or'): ConditionGroup {
  if (typeof node !== 'object' || !node) return { mode: fallback, conditions: [defaultLeaf()] }
  const obj = node as Record<string, unknown>
  if ('and' in obj && Array.isArray(obj.and)) {
    const conds = (obj.and as unknown[]).map(parseLeaf).filter(Boolean) as ConditionLeaf[]
    return { mode: 'and', conditions: conds.length ? conds : [defaultLeaf()] }
  }
  if ('or' in obj && Array.isArray(obj.or)) {
    const conds = (obj.or as unknown[]).map(parseLeaf).filter(Boolean) as ConditionLeaf[]
    return { mode: 'or', conditions: conds.length ? conds : [defaultLeaf()] }
  }
  const leaf = parseLeaf(node)
  return { mode: fallback, conditions: leaf ? [leaf] : [defaultLeaf()] }
}

function isLeafLike(node: unknown): boolean {
  if (typeof node !== 'object' || !node) return false
  return Object.keys(node as object).some((k) =>
    ['==', '!=', 'in', '!', 'startsWith', 'endsWith', '>', '<'].includes(k),
  )
}

export function parseLeaf(node: unknown): ConditionLeaf | null {
  if (typeof node !== 'object' || !node) return null
  const obj = node as Record<string, unknown>

  if ('==' in obj) {
    const [a, b] = obj['=='] as unknown[]
    const field = extractVar(a)
    if (field) return { field, operator: 'equals', value: String(b ?? '') }
  }
  if ('!=' in obj) {
    const [a, b] = obj['!='] as unknown[]
    const field = extractVar(a)
    if (field) return { field, operator: 'not_equals', value: String(b ?? '') }
  }
  if ('in' in obj) {
    const [needle, haystack] = obj['in'] as unknown[]
    const field = extractVar(haystack)
    if (field) return { field, operator: 'contains', value: String(needle ?? '') }
  }
  if ('!' in obj) {
    const inner = obj['!'] as Record<string, unknown>
    if (inner && 'in' in inner) {
      const [needle, haystack] = inner['in'] as unknown[]
      const field = extractVar(haystack)
      if (field) return { field, operator: 'not_contains', value: String(needle ?? '') }
    }
  }
  if ('startsWith' in obj) {
    const [str, prefix] = obj['startsWith'] as unknown[]
    const field = extractVar(str)
    if (field) return { field, operator: 'starts_with', value: String(prefix ?? '') }
  }
  if ('endsWith' in obj) {
    const [str, suffix] = obj['endsWith'] as unknown[]
    const field = extractVar(str)
    if (field) return { field, operator: 'ends_with', value: String(suffix ?? '') }
  }
  if ('>' in obj) {
    const [a, b] = obj['>'] as unknown[]
    const field = extractVar(a)
    if (field) return { field, operator: 'greater_than', value: String(b ?? '') }
  }
  if ('<' in obj) {
    const [a, b] = obj['<'] as unknown[]
    const field = extractVar(a)
    if (field) return { field, operator: 'less_than', value: String(b ?? '') }
  }
  return null
}

function extractVar(node: unknown): ConditionField | null {
  if (typeof node === 'object' && node && 'var' in node) {
    const v = (node as { var: string }).var
    return FIELDS.some((f) => f.value === v) ? (v as ConditionField) : null
  }
  return null
}

// ─── Evaluator (client-side rule tester) ─────────────────────────────────────

export function evalLogic(logic: unknown, data: Record<string, unknown>): boolean {
  if (typeof logic !== 'object' || !logic) return false
  const obj = logic as Record<string, unknown>

  if ('and' in obj) return (obj.and as unknown[]).every((c) => evalLogic(c, data))
  if ('or' in obj) return (obj.or as unknown[]).some((c) => evalLogic(c, data))
  if ('!' in obj) return !evalLogic(obj['!'], data)

  const rv = (v: unknown): unknown => {
    if (typeof v === 'object' && v && 'var' in v) return getPath(data, (v as { var: string }).var)
    return v
  }

  if ('==' in obj) {
    const [a, b] = obj['=='] as unknown[]
    return rv(a) == rv(b)
  }
  if ('!=' in obj) {
    const [a, b] = obj['!='] as unknown[]
    return rv(a) != rv(b)
  }
  if ('>' in obj) {
    const [a, b] = obj['>'] as unknown[]
    return Number(rv(a)) > Number(rv(b))
  }
  if ('<' in obj) {
    const [a, b] = obj['<'] as unknown[]
    return Number(rv(a)) < Number(rv(b))
  }
  if ('in' in obj) {
    const [needle, haystack] = obj['in'] as unknown[]
    const n = rv(needle)
    const h = rv(haystack)
    if (Array.isArray(h)) return h.includes(n)
    if (typeof h === 'string' && typeof n === 'string') return h.includes(n)
    return false
  }
  if ('startsWith' in obj) {
    const [str, prefix] = obj['startsWith'] as unknown[]
    return String(rv(str)).startsWith(String(rv(prefix)))
  }
  if ('endsWith' in obj) {
    const [str, suffix] = obj['endsWith'] as unknown[]
    return String(rv(str)).endsWith(String(rv(suffix)))
  }
  return false
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}
