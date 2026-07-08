import type { Rule, RuleActionType } from '@/types/server'
import logger from '@/lib/logger'

export const ACTION_LABELS: Partial<Record<RuleActionType, string>> = {
  block_hidden: 'Block (hidden)',
  block_reject: 'Block (reject)',
  quarantine_visible: 'Quarantine',
  quarantine_hidden: 'Silently held',
  archive: 'Archive',
  assign_label: 'Label',
  assign_workflow: 'Workflow',
  set_urgency: 'Urgency',
  forward: 'Forward',
  approve_sender: 'Approve',
  suppress_notification: 'Suppress',
  auto_draft: 'Auto draft',
  pong: 'Pong',
  forwardCalendarInvite: 'Forward calendar',
}

export const ACTION_COLORS: Partial<Record<RuleActionType, string>> = {
  block_hidden: 'text-ctp-red bg-ctp-red/10',
  block_reject: 'text-ctp-red bg-ctp-red/10',
  quarantine_visible: 'text-ctp-peach bg-ctp-peach/10',
  quarantine_hidden: 'text-ctp-subtext0 bg-ctp-surface1',
  archive: 'text-ctp-subtext0 bg-ctp-surface1',
  assign_label: 'text-ctp-blue bg-ctp-blue/10',
  approve_sender: 'text-ctp-green bg-ctp-green/10',
  forward: 'text-ctp-sapphire bg-ctp-sapphire/10',
  set_urgency: 'text-ctp-yellow bg-ctp-yellow/10',
  suppress_notification: 'text-ctp-lavender bg-ctp-lavender/10',
  pong: 'text-ctp-teal bg-ctp-teal/10',
  auto_draft: 'text-ctp-mauve bg-ctp-mauve/10',
}

export function conditionSummary(rule: Rule): string {
  if (!rule.condition) return 'Match all emails'
  try {
    const tree = JSON.parse(rule.condition) as unknown
    return summarizeLogic(tree)
  } catch (e) {
    logger.warn({ title: 'Failed to summarize rule condition', ruleId: rule.ruleId, error: e })
    return rule.condition
  }
}

export function summarizeLogic(node: unknown, depth = 0): string {
  if (typeof node !== 'object' || !node) return String(node)
  const obj = node as Record<string, unknown>

  if ('and' in obj && Array.isArray(obj.and)) {
    const parts = (obj.and as unknown[]).map((c) => summarizeLogic(c, depth + 1))
    const joined = parts.join(' AND ')
    return depth > 0 ? `(${joined})` : joined
  }
  if ('or' in obj && Array.isArray(obj.or)) {
    const parts = (obj.or as unknown[]).map((c) => summarizeLogic(c, depth + 1))
    const joined = parts.join(' OR ')
    return depth > 0 ? `(${joined})` : joined
  }

  const varOf = (v: unknown) =>
    typeof v === 'object' && v && 'var' in v ? (v as { var: string }).var : String(v)

  if ('==' in obj) {
    const [a, b] = obj['=='] as unknown[]
    return `${varOf(a)} = "${b}"`
  }
  if ('!=' in obj) {
    const [a, b] = obj['!='] as unknown[]
    return `${varOf(a)} ≠ "${b}"`
  }
  if ('>' in obj) {
    const [a, b] = obj['>'] as unknown[]
    return `${varOf(a)} > ${b}`
  }
  if ('<' in obj) {
    const [a, b] = obj['<'] as unknown[]
    return `${varOf(a)} < ${b}`
  }
  if ('in' in obj) {
    const [n, h] = obj['in'] as unknown[]
    return `${varOf(h)} contains "${n}"`
  }
  if ('!!' in obj) {
    const inner = Array.isArray(obj['!!']) ? obj['!!'][0] : obj['!!']
    return `${varOf(inner)} exists`
  }
  if ('!' in obj) return `NOT (${summarizeLogic(obj['!'], depth + 1)})`
  if ('startsWith' in obj) {
    const [s, p] = obj['startsWith'] as unknown[]
    return `${varOf(s)} starts with "${p}"`
  }
  if ('endsWith' in obj) {
    const [s, p] = obj['endsWith'] as unknown[]
    return `${varOf(s)} ends with "${p}"`
  }
  return JSON.stringify(node)
}
