import { describe, it, expect } from 'vitest'
import {
  defaultLeaf,
  evalLogic,
  leafToLogic,
  logicToGroups,
  groupToLogic,
  parseLeaf,
  serializeCondition,
} from '@/lib/ruleLogic'
import type { ConditionGroup, ConditionLeaf } from '@/types/server'

// ─── leafToLogic ─────────────────────────────────────────────────────────────

describe('leafToLogic', () => {
  it('equals → ==', () => {
    const leaf: ConditionLeaf = {
      field: 'signal.from.address',
      operator: 'equals',
      value: 'x@y.com',
    }
    expect(leafToLogic(leaf)).toEqual({ '==': [{ var: 'signal.from.address' }, 'x@y.com'] })
  })

  it('not_equals → !=', () => {
    const leaf: ConditionLeaf = { field: 'signal.subject', operator: 'not_equals', value: 'hello' }
    expect(leafToLogic(leaf)).toEqual({ '!=': [{ var: 'signal.subject' }, 'hello'] })
  })

  it('contains → in (needle first)', () => {
    const leaf: ConditionLeaf = { field: 'signal.from.domain', operator: 'contains', value: 'spam' }
    expect(leafToLogic(leaf)).toEqual({ in: ['spam', { var: 'signal.from.domain' }] })
  })

  it('not_contains → !in', () => {
    const leaf: ConditionLeaf = {
      field: 'signal.subject',
      operator: 'not_contains',
      value: 'unsubscribe',
    }
    expect(leafToLogic(leaf)).toEqual({ '!': { in: ['unsubscribe', { var: 'signal.subject' }] } })
  })

  it('starts_with → startsWith', () => {
    const leaf: ConditionLeaf = {
      field: 'signal.from.address',
      operator: 'starts_with',
      value: 'no-reply',
    }
    expect(leafToLogic(leaf)).toEqual({ startsWith: [{ var: 'signal.from.address' }, 'no-reply'] })
  })

  it('ends_with → endsWith', () => {
    const leaf: ConditionLeaf = { field: 'signal.from.domain', operator: 'ends_with', value: '.ru' }
    expect(leafToLogic(leaf)).toEqual({ endsWith: [{ var: 'signal.from.domain' }, '.ru'] })
  })

  it('greater_than → > (numeric)', () => {
    const leaf: ConditionLeaf = { field: 'signal.spamScore', operator: 'greater_than', value: '7' }
    expect(leafToLogic(leaf)).toEqual({ '>': [{ var: 'signal.spamScore' }, 7] })
  })

  it('less_than → < (numeric)', () => {
    const leaf: ConditionLeaf = { field: 'signal.spamScore', operator: 'less_than', value: '3' }
    expect(leafToLogic(leaf)).toEqual({ '<': [{ var: 'signal.spamScore' }, 3] })
  })

  it('spamScore field coerces value to number for equals', () => {
    const leaf: ConditionLeaf = { field: 'signal.spamScore', operator: 'equals', value: '5' }
    const result = leafToLogic(leaf) as { '==': unknown[] }
    expect(result['=='][1]).toBe(5)
  })
})

// ─── groupToLogic ─────────────────────────────────────────────────────────────

describe('groupToLogic', () => {
  it('single condition returns leaf directly (no wrapper)', () => {
    const group: ConditionGroup = {
      mode: 'and',
      conditions: [{ field: 'signal.from.address', operator: 'equals', value: 'x@y.com' }],
    }
    expect(groupToLogic(group)).toEqual({ '==': [{ var: 'signal.from.address' }, 'x@y.com'] })
  })

  it('multiple conditions wrap in and', () => {
    const group: ConditionGroup = {
      mode: 'and',
      conditions: [
        { field: 'signal.from.address', operator: 'equals', value: 'a@b.com' },
        { field: 'signal.subject', operator: 'contains', value: 'urgent' },
      ],
    }
    const result = groupToLogic(group) as { and: unknown[] }
    expect(result.and).toHaveLength(2)
  })

  it('OR mode wraps in or', () => {
    const group: ConditionGroup = {
      mode: 'or',
      conditions: [
        { field: 'signal.from.address', operator: 'equals', value: 'a@b.com' },
        { field: 'signal.from.address', operator: 'equals', value: 'c@d.com' },
      ],
    }
    const result = groupToLogic(group) as { or: unknown[] }
    expect(result.or).toHaveLength(2)
  })
})

// ─── serializeCondition ──────────────────────────────────────────────────────

describe('serializeCondition', () => {
  it('single group single condition → leaf JSON', () => {
    const groups: ConditionGroup[] = [
      {
        mode: 'and',
        conditions: [{ field: 'signal.from.address', operator: 'equals', value: 'x@y.com' }],
      },
    ]
    const json = serializeCondition(groups)
    expect(JSON.parse(json)).toEqual({ '==': [{ var: 'signal.from.address' }, 'x@y.com'] })
  })

  it('multiple groups wrap in top-level and', () => {
    const groups: ConditionGroup[] = [
      {
        mode: 'and',
        conditions: [{ field: 'signal.from.address', operator: 'equals', value: 'a@b.com' }],
      },
      {
        mode: 'or',
        conditions: [{ field: 'signal.subject', operator: 'contains', value: 'sale' }],
      },
    ]
    const parsed = JSON.parse(serializeCondition(groups)) as { and: unknown[] }
    expect(parsed.and).toHaveLength(2)
  })
})

// ─── parseLeaf ───────────────────────────────────────────────────────────────

describe('parseLeaf', () => {
  it('parses == to equals', () => {
    const result = parseLeaf({ '==': [{ var: 'signal.from.address' }, 'x@y.com'] })
    expect(result).toEqual({ field: 'signal.from.address', operator: 'equals', value: 'x@y.com' })
  })

  it('parses != to not_equals', () => {
    const result = parseLeaf({ '!=': [{ var: 'signal.subject' }, 'hello'] })
    expect(result).toEqual({ field: 'signal.subject', operator: 'not_equals', value: 'hello' })
  })

  it('parses in to contains', () => {
    const result = parseLeaf({ in: ['spam', { var: 'signal.from.domain' }] })
    expect(result).toEqual({ field: 'signal.from.domain', operator: 'contains', value: 'spam' })
  })

  it('parses !in to not_contains', () => {
    const result = parseLeaf({ '!': { in: ['promo', { var: 'signal.subject' }] } })
    expect(result).toEqual({ field: 'signal.subject', operator: 'not_contains', value: 'promo' })
  })

  it('parses startsWith to starts_with', () => {
    const result = parseLeaf({ startsWith: [{ var: 'signal.from.address' }, 'no-reply'] })
    expect(result).toEqual({
      field: 'signal.from.address',
      operator: 'starts_with',
      value: 'no-reply',
    })
  })

  it('parses endsWith to ends_with', () => {
    const result = parseLeaf({ endsWith: [{ var: 'signal.from.domain' }, '.ru'] })
    expect(result).toEqual({ field: 'signal.from.domain', operator: 'ends_with', value: '.ru' })
  })

  it('parses > to greater_than', () => {
    const result = parseLeaf({ '>': [{ var: 'signal.spamScore' }, 7] })
    expect(result).toEqual({ field: 'signal.spamScore', operator: 'greater_than', value: '7' })
  })

  it('returns null for unknown var', () => {
    const result = parseLeaf({ '==': [{ var: 'unknown.field' }, 'x'] })
    expect(result).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(parseLeaf(null)).toBeNull()
    expect(parseLeaf('string')).toBeNull()
    expect(parseLeaf(42)).toBeNull()
  })
})

// ─── logicToGroups (round-trip deserialization) ───────────────────────────────

describe('logicToGroups', () => {
  it('single leaf deserializes to one group with one condition', () => {
    const json = JSON.stringify({ '==': [{ var: 'signal.from.address' }, 'x@y.com'] })
    const groups = logicToGroups(json)
    expect(groups).toHaveLength(1)
    expect(groups[0].conditions).toHaveLength(1)
    expect(groups[0].conditions[0]).toEqual({
      field: 'signal.from.address',
      operator: 'equals',
      value: 'x@y.com',
    })
  })

  it('flat and-list deserializes to one AND group', () => {
    const json = JSON.stringify({
      and: [
        { '==': [{ var: 'signal.from.address' }, 'a@b.com'] },
        { in: ['urgent', { var: 'signal.subject' }] },
      ],
    })
    const groups = logicToGroups(json)
    expect(groups).toHaveLength(1)
    expect(groups[0].mode).toBe('and')
    expect(groups[0].conditions).toHaveLength(2)
  })

  it('nested and-of-groups deserializes to multiple groups', () => {
    const json = JSON.stringify({
      and: [
        { and: [{ '==': [{ var: 'signal.from.address' }, 'a@b.com'] }] },
        { or: [{ '==': [{ var: 'signal.subject' }, 'sale'] }] },
      ],
    })
    const groups = logicToGroups(json)
    expect(groups).toHaveLength(2)
    expect(groups[0].mode).toBe('and')
    expect(groups[1].mode).toBe('or')
  })

  it('or-list deserializes to one OR group', () => {
    const json = JSON.stringify({
      or: [
        { '==': [{ var: 'signal.from.address' }, 'a@b.com'] },
        { '==': [{ var: 'signal.from.address' }, 'c@d.com'] },
      ],
    })
    const groups = logicToGroups(json)
    expect(groups).toHaveLength(1)
    expect(groups[0].mode).toBe('or')
  })

  it('returns default leaf on invalid JSON', () => {
    const groups = logicToGroups('not valid json')
    expect(groups).toHaveLength(1)
    expect(groups[0].conditions[0]).toEqual(defaultLeaf())
  })
})

// ─── round-trip serialize → deserialize ──────────────────────────────────────

describe('serialize/deserialize round-trip', () => {
  it('single condition round-trips', () => {
    const original: ConditionGroup[] = [
      {
        mode: 'and',
        conditions: [
          { field: 'signal.from.address', operator: 'equals', value: 'test@example.com' },
        ],
      },
    ]
    const restored = logicToGroups(serializeCondition(original))
    expect(restored).toEqual(original)
  })

  it('multi-condition AND group round-trips', () => {
    const original: ConditionGroup[] = [
      {
        mode: 'and',
        conditions: [
          { field: 'signal.from.address', operator: 'equals', value: 'spam@evil.com' },
          { field: 'signal.subject', operator: 'contains', value: 'prize' },
        ],
      },
    ]
    const restored = logicToGroups(serializeCondition(original))
    expect(restored[0].mode).toBe('and')
    expect(restored[0].conditions).toHaveLength(2)
  })

  it('multi-group with multiple conditions per group round-trips', () => {
    const original: ConditionGroup[] = [
      {
        mode: 'and',
        conditions: [
          { field: 'signal.from.address', operator: 'equals', value: 'a@b.com' },
          { field: 'signal.subject', operator: 'contains', value: 'hello' },
        ],
      },
      {
        mode: 'or',
        conditions: [
          { field: 'signal.subject', operator: 'starts_with', value: 'FWD' },
          { field: 'signal.subject', operator: 'starts_with', value: 'RE:' },
        ],
      },
    ]
    const restored = logicToGroups(serializeCondition(original))
    expect(restored).toHaveLength(2)
    expect(restored[0].mode).toBe('and')
    expect(restored[1].mode).toBe('or')
    expect(restored[1].conditions).toHaveLength(2)
  })

  it('single-condition groups flatten on round-trip (known limitation)', () => {
    // Two groups each with one condition serialize as a flat and-list → merge into one group
    const original: ConditionGroup[] = [
      {
        mode: 'and',
        conditions: [{ field: 'signal.from.address', operator: 'equals', value: 'a@b.com' }],
      },
      {
        mode: 'or',
        conditions: [{ field: 'signal.subject', operator: 'starts_with', value: 'FWD' }],
      },
    ]
    const restored = logicToGroups(serializeCondition(original))
    expect(restored).toHaveLength(1)
    expect(restored[0].mode).toBe('and')
    expect(restored[0].conditions).toHaveLength(2)
  })

  it('OR group round-trips', () => {
    const original: ConditionGroup[] = [
      {
        mode: 'or',
        conditions: [
          { field: 'signal.from.address', operator: 'equals', value: 'a@b.com' },
          { field: 'signal.from.address', operator: 'equals', value: 'c@d.com' },
        ],
      },
    ]
    const restored = logicToGroups(serializeCondition(original))
    expect(restored[0].mode).toBe('or')
    expect(restored[0].conditions).toHaveLength(2)
  })
})

// ─── evalLogic ───────────────────────────────────────────────────────────────

describe('evalLogic', () => {
  const email = {
    signal: {
      from: { address: 'spam@evil.com', domain: 'evil.com' },
      subject: 'You won a prize!',
      workflow: 'content',
      spamScore: 8,
    },
    thread: { labels: ['promo'], urgency: 'low', status: 'active' },
  } as Record<string, unknown>

  it('== match', () => {
    expect(evalLogic({ '==': [{ var: 'signal.from.address' }, 'spam@evil.com'] }, email)).toBe(true)
  })

  it('== no match', () => {
    expect(evalLogic({ '==': [{ var: 'signal.from.address' }, 'good@safe.com'] }, email)).toBe(
      false,
    )
  })

  it('!= match', () => {
    expect(evalLogic({ '!=': [{ var: 'signal.from.address' }, 'good@safe.com'] }, email)).toBe(true)
  })

  it('in (contains string)', () => {
    expect(evalLogic({ in: ['prize', { var: 'signal.subject' }] }, email)).toBe(true)
  })

  it('! negation', () => {
    expect(
      evalLogic({ '!': { '==': [{ var: 'signal.from.address' }, 'spam@evil.com'] } }, email),
    ).toBe(false)
  })

  it('> numeric', () => {
    expect(evalLogic({ '>': [{ var: 'signal.spamScore' }, 5] }, email)).toBe(true)
    expect(evalLogic({ '>': [{ var: 'signal.spamScore' }, 9] }, email)).toBe(false)
  })

  it('< numeric', () => {
    expect(evalLogic({ '<': [{ var: 'signal.spamScore' }, 9] }, email)).toBe(true)
    expect(evalLogic({ '<': [{ var: 'signal.spamScore' }, 5] }, email)).toBe(false)
  })

  it('startsWith', () => {
    expect(evalLogic({ startsWith: [{ var: 'signal.subject' }, 'You won'] }, email)).toBe(true)
    expect(evalLogic({ startsWith: [{ var: 'signal.subject' }, 'Hello'] }, email)).toBe(false)
  })

  it('endsWith', () => {
    expect(evalLogic({ endsWith: [{ var: 'signal.from.domain' }, '.com'] }, email)).toBe(true)
    expect(evalLogic({ endsWith: [{ var: 'signal.from.domain' }, '.ru'] }, email)).toBe(false)
  })

  it('and — all true', () => {
    expect(
      evalLogic(
        {
          and: [
            { '==': [{ var: 'signal.from.address' }, 'spam@evil.com'] },
            { '>': [{ var: 'signal.spamScore' }, 5] },
          ],
        },
        email,
      ),
    ).toBe(true)
  })

  it('and — one false', () => {
    expect(
      evalLogic(
        {
          and: [
            { '==': [{ var: 'signal.from.address' }, 'spam@evil.com'] },
            { '>': [{ var: 'signal.spamScore' }, 99] },
          ],
        },
        email,
      ),
    ).toBe(false)
  })

  it('or — one true', () => {
    expect(
      evalLogic(
        {
          or: [
            { '==': [{ var: 'signal.from.address' }, 'good@safe.com'] },
            { '==': [{ var: 'signal.from.address' }, 'spam@evil.com'] },
          ],
        },
        email,
      ),
    ).toBe(true)
  })

  it('or — all false', () => {
    expect(
      evalLogic(
        {
          or: [
            { '==': [{ var: 'signal.from.address' }, 'a@b.com'] },
            { '==': [{ var: 'signal.from.address' }, 'c@d.com'] },
          ],
        },
        email,
      ),
    ).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(evalLogic(null, email)).toBe(false)
    expect(evalLogic('string', email)).toBe(false)
    expect(evalLogic({}, email)).toBe(false)
  })
})
