import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useLabelsStore } from '@/stores/labels'
import type { Label } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listLabels: vi.fn(),
      createLabel: vi.fn(),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/lib/api'

function mockLabel(overrides: Partial<Label> = {}): Label {
  return {
    id: 'lbl_1',
    accountId: 'acc_1',
    name: 'Test label',
    color: '#cba6f7',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('labelsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchLabels populates items', async () => {
    vi.mocked(api.listLabels).mockResolvedValue(ok([mockLabel()]))
    const store = useLabelsStore()
    await store.fetchLabels('acc_1')
    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchLabels sets error on failure', async () => {
    vi.mocked(api.listLabels).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useLabelsStore()
    await store.fetchLabels('acc_1')
    expect(store.items).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('createLabel adds item and returns true', async () => {
    vi.mocked(api.createLabel).mockResolvedValue(ok(mockLabel({ id: 'lbl_2', name: 'New' })))
    const store = useLabelsStore()
    const result = await store.createLabel('acc_1', { name: 'New' })
    expect(result).toBe(true)
    expect(store.items).toHaveLength(1)
    expect(store.items[0].name).toBe('New')
  })

  it('createLabel sets error and returns false on failure', async () => {
    vi.mocked(api.createLabel).mockResolvedValue(err(new ApiError(400, 'Bad request')))
    const store = useLabelsStore()
    const result = await store.createLabel('acc_1', { name: 'New' })
    expect(result).toBe(false)
    expect(store.error).toBe('Bad request')
  })

  it('updateLabel replaces item in list', async () => {
    const updated = mockLabel({ name: 'Updated', color: '#f38ba8' })
    vi.mocked(api.updateLabel).mockResolvedValue(ok(updated))
    const store = useLabelsStore()
    store.items = [mockLabel()]
    const result = await store.updateLabel('acc_1', 'lbl_1', { name: 'Updated' })
    expect(result).toBe(true)
    expect(store.items[0].name).toBe('Updated')
    expect(store.items[0].color).toBe('#f38ba8')
  })

  it('deleteLabel removes item from list', async () => {
    vi.mocked(api.deleteLabel).mockResolvedValue(ok(undefined))
    const store = useLabelsStore()
    store.items = [mockLabel({ id: 'lbl_1' }), mockLabel({ id: 'lbl_2' })]
    const result = await store.deleteLabel('acc_1', 'lbl_1')
    expect(result).toBe(true)
    expect(store.items.map((l) => l.id)).toEqual(['lbl_2'])
  })

  it('deleteLabel sets error and returns false on failure', async () => {
    vi.mocked(api.deleteLabel).mockResolvedValue(err(new ApiError(404, 'Not found')))
    const store = useLabelsStore()
    store.items = [mockLabel()]
    const result = await store.deleteLabel('acc_1', 'lbl_1')
    expect(result).toBe(false)
    expect(store.error).toBe('Not found')
    expect(store.items).toHaveLength(1)
  })

  it('clearError resets error', () => {
    const store = useLabelsStore()
    store.error = 'some error'
    store.clearError()
    expect(store.error).toBeNull()
  })
})
