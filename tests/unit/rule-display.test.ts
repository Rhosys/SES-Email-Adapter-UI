import { describe, it, expect } from 'vitest'
import { conditionSummary, summarizeLogic } from '@/lib/rule-display'
import type { Rule } from '@/types/server'

function mockRule(condition: string): Rule {
  return {
    ruleId: 'r1',
    name: 'Test',
    status: 'enabled',
    priorityOrder: 1,
    condition,
    actions: [{ type: 'archive' }],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }
}

describe('summarizeLogic — "in" operator', () => {
  it('resolves a var-needle against a literal-array haystack ("field is one of these values")', () => {
    const tree = { in: [{ var: 'signal.from.domain' }, ['amazon.com', 'dhl.de']] }
    expect(summarizeLogic(tree)).toBe('signal.from.domain is one of "amazon.com", "dhl.de"')
  })

  it('does not render "[object Object]" when the needle is a var', () => {
    const tree = { in: [{ var: 'signal.workflowData.paymentType' }, ['invoice', 'receipt']] }
    expect(summarizeLogic(tree)).not.toContain('[object Object]')
  })

  it('resolves a literal-needle against a var-haystack ("field contains this literal")', () => {
    const tree = { in: ['urgent-label', { var: 'thread.labels' }] }
    expect(summarizeLogic(tree)).toBe('thread.labels contains "urgent-label"')
  })
})

describe('conditionSummary', () => {
  it('returns "Match all emails" for an empty condition', () => {
    expect(conditionSummary(mockRule(''))).toBe('Match all emails')
  })

  it('summarizes a full and/in tree end-to-end', () => {
    const condition = JSON.stringify({
      and: [
        { in: [{ var: 'signal.workflowData.paymentType' }, ['invoice', 'receipt']] },
        { '==': [{ var: 'signal.workflow' }, 'payments'] },
      ],
    })
    const summary = conditionSummary(mockRule(condition))
    expect(summary).toContain('signal.workflowData.paymentType is one of "invoice", "receipt"')
    expect(summary).toContain('signal.workflow = "payments"')
    expect(summary).not.toContain('[object Object]')
  })

  it('falls back to the raw condition string for non-JSON (JS) conditions', () => {
    const js = 'return signal.workflow === "payments"'
    expect(conditionSummary(mockRule(js))).toBe(js)
  })
})
