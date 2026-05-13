import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useRulesStore } from '@/stores/rules'
import type { Rule } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listRules: vi.fn(),
      createRule: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/lib/api'

function mockRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule_1',
    accountId: 'acc_1',
    name: 'Test rule',
    conditions: [{ field: 'from.address', operator: 'equals', value: 'spam@example.com' }],
    action: 'block',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('rulesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchRules populates items', async () => {
    vi.mocked(api.listRules).mockResolvedValue(ok([mockRule()]))
    const store = useRulesStore()
    await store.fetchRules('acc_1')
    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchRules sets error on failure', async () => {
    vi.mocked(api.listRules).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useRulesStore()
    await store.fetchRules('acc_1')
    expect(store.items).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('createRule adds item and returns it', async () => {
    const rule = mockRule({ id: 'rule_2', name: 'New rule' })
    vi.mocked(api.createRule).mockResolvedValue(ok(rule))
    const store = useRulesStore()
    const result = await store.createRule('acc_1', {
      name: 'New rule',
      conditions: [],
      action: 'block',
    })
    expect(result).toEqual(rule)
    expect(store.items).toHaveLength(1)
  })

  it('createRule sets error and returns null on failure', async () => {
    vi.mocked(api.createRule).mockResolvedValue(err(new ApiError(400, 'Invalid')))
    const store = useRulesStore()
    const result = await store.createRule('acc_1', { name: 'x', conditions: [], action: 'allow' })
    expect(result).toBeNull()
    expect(store.error).toBe('Invalid')
  })

  it('updateRule replaces item in list', async () => {
    const updated = mockRule({ name: 'Updated rule' })
    vi.mocked(api.updateRule).mockResolvedValue(ok(updated))
    const store = useRulesStore()
    store.items = [mockRule()]
    const result = await store.updateRule('acc_1', 'rule_1', { name: 'Updated rule' })
    expect(result?.name).toBe('Updated rule')
    expect(store.items[0].name).toBe('Updated rule')
  })

  it('deleteRule removes item from list', async () => {
    vi.mocked(api.deleteRule).mockResolvedValue(ok(undefined))
    const store = useRulesStore()
    store.items = [mockRule({ id: 'rule_1' }), mockRule({ id: 'rule_2' })]
    const result = await store.deleteRule('acc_1', 'rule_1')
    expect(result).toBe(true)
    expect(store.items.map((r) => r.id)).toEqual(['rule_2'])
  })

  it('deleteRule sets error and returns false on failure', async () => {
    vi.mocked(api.deleteRule).mockResolvedValue(err(new ApiError(404, 'Not found')))
    const store = useRulesStore()
    store.items = [mockRule()]
    const result = await store.deleteRule('acc_1', 'rule_1')
    expect(result).toBe(false)
    expect(store.error).toBe('Not found')
    expect(store.items).toHaveLength(1)
  })

  it('clearError resets error', () => {
    const store = useRulesStore()
    store.error = 'some error'
    store.clearError()
    expect(store.error).toBeNull()
  })

  it('savePending is true during API call', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof api.createRule>>) => void
    vi.mocked(api.createRule).mockReturnValue(
      new Promise((res) => {
        resolve = res
      }),
    )
    const store = useRulesStore()
    const p = store.createRule('acc_1', { name: 'x', conditions: [], action: 'allow' })
    expect(store.savePending).toBe(true)
    resolve(ok(mockRule()))
    await p
    expect(store.savePending).toBe(false)
  })
})
