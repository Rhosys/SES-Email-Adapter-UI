import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia, defineStore } from 'pinia'
import { createApp, ref } from 'vue'

// --- localStorage mock ---
const storage = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { storage.set(key, value) }),
  removeItem: vi.fn((key: string) => { storage.delete(key) }),
  get length() { return storage.size },
  key: vi.fn((i: number) => [...storage.keys()][i] ?? null),
  clear: vi.fn(() => storage.clear()),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// --- Mock logger ---
vi.mock('@/lib/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// --- Mock account store ---
let mockAccountId: string | null = 'acc_test123'
vi.mock('@/stores/account', () => ({
  useAccountStore: () => ({ get accountId() { return mockAccountId } }),
}))

import {
  readFromLocalStorage,
  writeToLocalStorage,
  removeAllForAccount,
  persistentStorePlugin,
} from './persistent-store'
import logger from '@/lib/logger'

describe('persistent-store plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))
    storage.clear()
    vi.clearAllMocks()
    mockAccountId = 'acc_test123'
    // Restore all localStorage mock implementations after clearAllMocks
    localStorageMock.getItem.mockImplementation((key: string) => storage.get(key) ?? null)
    localStorageMock.setItem.mockImplementation((key: string, value: string) => { storage.set(key, value) })
    localStorageMock.removeItem.mockImplementation((key: string) => { storage.delete(key) })
    localStorageMock.key.mockImplementation((i: number) => [...storage.keys()][i] ?? null)
    localStorageMock.clear.mockImplementation(() => storage.clear())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─────────────────────────────────────────────────────────
  // readFromLocalStorage
  // ─────────────────────────────────────────────────────────
  describe('readFromLocalStorage', () => {
    it('returns undefined when key does not exist', () => {
      const result = readFromLocalStorage('acc_test123', 'arcs')
      expect(result).toBeUndefined()
    })

    it('returns data when valid envelope exists within TTL', () => {
      const envelope = { data: [{ arcId: 'arc_1', status: 'active' }], writtenAt: Date.now() - 1000 }
      storage.set('ses:v1:acc_test123:arcs', JSON.stringify(envelope))

      const result = readFromLocalStorage<{ arcId: string; status: string }[]>('acc_test123', 'arcs')
      expect(result).toEqual([{ arcId: 'arc_1', status: 'active' }])
    })

    it('returns undefined and removes key when data is expired (7 days)', () => {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
      const envelope = { data: [{ arcId: 'arc_old' }], writtenAt: Date.now() - sevenDaysMs - 1 }
      storage.set('ses:v1:acc_test123:arcs', JSON.stringify(envelope))

      const result = readFromLocalStorage('acc_test123', 'arcs')
      expect(result).toBeUndefined()
      expect(storage.has('ses:v1:acc_test123:arcs')).toBe(false)
    })

    it('returns undefined and removes key when JSON is corrupted', () => {
      storage.set('ses:v1:acc_test123:arcs', '{not valid json!!!')

      const result = readFromLocalStorage('acc_test123', 'arcs')
      expect(result).toBeUndefined()
      expect(storage.has('ses:v1:acc_test123:arcs')).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Cache read: corrupted JSON removed' }),
      )
    })

    it('handles missing writtenAt field (treats as expired)', () => {
      const envelope = { data: { items: ['test'] } }
      storage.set('ses:v1:acc_test123:signals', JSON.stringify(envelope))

      const result = readFromLocalStorage('acc_test123', 'signals')
      expect(result).toBeUndefined()
      expect(storage.has('ses:v1:acc_test123:signals')).toBe(false)
    })

    it('handles writtenAt of zero (falsy — treated as expired)', () => {
      const envelope = { data: { items: ['test'] }, writtenAt: 0 }
      storage.set('ses:v1:acc_test123:signals', JSON.stringify(envelope))

      const result = readFromLocalStorage('acc_test123', 'signals')
      expect(result).toBeUndefined()
      expect(storage.has('ses:v1:acc_test123:signals')).toBe(false)
    })

    it.each([
      // The condition is `> MAX_AGE_MS` (strict greater-than)
      ['exactly at boundary (still valid)', 7 * 24 * 60 * 60 * 1000, false],
      ['one ms before expiry (valid)', 7 * 24 * 60 * 60 * 1000 - 1, false],
      ['one ms past expiry (expired)', 7 * 24 * 60 * 60 * 1000 + 1, true],
    ])('TTL boundary: %s', (_label, ageMs, shouldExpire) => {
      const envelope = { data: 'payload', writtenAt: Date.now() - ageMs }
      storage.set('ses:v1:acc_test123:test', JSON.stringify(envelope))

      const result = readFromLocalStorage('acc_test123', 'test')
      if (shouldExpire) {
        expect(result).toBeUndefined()
      } else {
        expect(result).toBe('payload')
      }
    })
  })

  // ─────────────────────────────────────────────────────────
  // writeToLocalStorage
  // ─────────────────────────────────────────────────────────
  describe('writeToLocalStorage', () => {
    it('writes data wrapped in CacheEnvelope with writtenAt timestamp', () => {
      const data = [{ arcId: 'arc_1', status: 'active' }]
      writeToLocalStorage('acc_test123', 'arcs', data)

      const raw = storage.get('ses:v1:acc_test123:arcs')
      expect(raw).toBeDefined()
      const parsed = JSON.parse(raw!)
      expect(parsed.data).toEqual(data)
      expect(parsed.writtenAt).toBe(Date.now())
    })

    it('on setItem error: logs warning and does not crash', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('disk full')
      })

      expect(() => writeToLocalStorage('acc_test123', 'arcs', 'data')).not.toThrow()
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Cache write failed' }),
      )
    })
  })

  // ─────────────────────────────────────────────────────────
  // removeAllForAccount
  // ─────────────────────────────────────────────────────────
  describe('removeAllForAccount', () => {
    it('removes all keys matching ses:v1:{accountId}:*', () => {
      storage.set('ses:v1:acc_target:arcs', 'a')
      storage.set('ses:v1:acc_target:signals', 'b')
      storage.set('ses:v1:acc_target:quarantine', 'c')

      removeAllForAccount('acc_target')

      expect(storage.has('ses:v1:acc_target:arcs')).toBe(false)
      expect(storage.has('ses:v1:acc_target:signals')).toBe(false)
      expect(storage.has('ses:v1:acc_target:quarantine')).toBe(false)
    })

    it('does not remove keys for other accounts', () => {
      storage.set('ses:v1:acc_target:arcs', 'a')
      storage.set('ses:v1:acc_other:arcs', 'b')
      storage.set('ses:v1:acc_third:signals', 'c')

      removeAllForAccount('acc_target')

      expect(storage.has('ses:v1:acc_other:arcs')).toBe(true)
      expect(storage.has('ses:v1:acc_third:signals')).toBe(true)
    })

    it('does not remove non-cache keys (e.g., ses:tabAccountId)', () => {
      storage.set('ses:tabAccountId', 'acc_target')
      storage.set('ses:lastAccountId', 'acc_target')
      storage.set('ses:v1:acc_target:arcs', 'a')

      removeAllForAccount('acc_target')

      expect(storage.has('ses:tabAccountId')).toBe(true)
      expect(storage.has('ses:lastAccountId')).toBe(true)
      expect(storage.has('ses:v1:acc_target:arcs')).toBe(false)
    })
  })

  // ─────────────────────────────────────────────────────────
  // Key format
  // ─────────────────────────────────────────────────────────
  describe('key format', () => {
    it.each([
      ['acc_abc123', 'arcs', 'ses:v1:acc_abc123:arcs'],
      ['acc_xyz789', 'signals', 'ses:v1:acc_xyz789:signals'],
      ['acc_foo', 'quarantine', 'ses:v1:acc_foo:quarantine'],
    ])('key for accountId=%s storeId=%s is %s', (accountId, storeId, expectedKey) => {
      writeToLocalStorage(accountId, storeId, { test: true })
      expect(storage.has(expectedKey)).toBe(true)
    })

    it('key includes version, accountId, and storeId segments', () => {
      writeToLocalStorage('acc_segments', 'labels', [])
      const key = [...storage.keys()].find((k) => k.includes('acc_segments'))
      expect(key).toBe('ses:v1:acc_segments:labels')
      const parts = key!.split(':')
      expect(parts[0]).toBe('ses')
      expect(parts[1]).toBe('v1')
      expect(parts[2]).toBe('acc_segments')
      expect(parts[3]).toBe('labels')
    })
  })

  // ─────────────────────────────────────────────────────────
  // persistentStorePlugin
  // ─────────────────────────────────────────────────────────
  describe('persistentStorePlugin', () => {
    function createPiniaWithPlugin() {
      const app = createApp({ template: '<div />' })
      const pinia = createPinia()
      pinia.use(persistentStorePlugin)
      app.use(pinia)
      setActivePinia(pinia)
      return pinia
    }

    it('hydrates store from cache on creation when accountId available', () => {
      const cachedData = [{ arcId: 'arc_cached', status: 'active' }]
      const envelope = { data: cachedData, writtenAt: Date.now() - 5000 }
      storage.set('ses:v1:acc_test123:hydrate1', JSON.stringify(envelope))
      mockAccountId = 'acc_test123'

      createPiniaWithPlugin()

      const useTestStore = defineStore('hydrate1', () => {
        const _byAccount = ref<Record<string, unknown[]>>({})
        return { _byAccount }
      }, { persist: { accountKeyedRef: '_byAccount' } })

      const store = useTestStore()
      expect(store._byAccount['acc_test123']).toEqual(cachedData)
    })

    it('does not hydrate when accountId is null', () => {
      const envelope = { data: [{ arcId: 'arc_1' }], writtenAt: Date.now() }
      storage.set('ses:v1:acc_test123:testStore2', JSON.stringify(envelope))
      mockAccountId = null

      createPiniaWithPlugin()

      const useTestStore = defineStore('testStore2', {
        state: () => ({ _byAccount: {} as Record<string, unknown[]> }),
        persist: { accountKeyedRef: '_byAccount' },
      })

      const store = useTestStore()
      expect(store._byAccount).toEqual({})
    })

    it('does not hydrate when no cached data exists', () => {
      mockAccountId = 'acc_test123'

      createPiniaWithPlugin()

      const useTestStore = defineStore('testStore3', {
        state: () => ({ _byAccount: {} as Record<string, unknown[]> }),
        persist: { accountKeyedRef: '_byAccount' },
      })

      const store = useTestStore()
      expect(store._byAccount).toEqual({})
    })

    it('auto-persists on store mutation via $subscribe', () => {
      mockAccountId = 'acc_test123'

      createPiniaWithPlugin()

      const useTestStore = defineStore('testStore4', {
        state: () => ({ _byAccount: {} as Record<string, unknown[]> }),
        persist: { accountKeyedRef: '_byAccount' },
      })

      const store = useTestStore()
      store.$patch({ _byAccount: { acc_test123: [{ id: 'item_1' }] } })

      const raw = storage.get('ses:v1:acc_test123:testStore4')
      expect(raw).toBeDefined()
      const parsed = JSON.parse(raw!)
      expect(parsed.data).toEqual([{ id: 'item_1' }])
      expect(parsed.writtenAt).toBe(Date.now())
    })

    it('applies filter before writing when filter option is provided', () => {
      mockAccountId = 'acc_test123'

      createPiniaWithPlugin()

      const useTestStore = defineStore('testStore5', {
        state: () => ({ _byAccount: {} as Record<string, { status: string }[]> }),
        persist: {
          accountKeyedRef: '_byAccount',
          filter: (items) => (items as { status: string }[]).filter((i) => i.status === 'active'),
        },
      })

      const store = useTestStore()
      store.$patch({
        _byAccount: {
          acc_test123: [
            { status: 'active' },
            { status: 'archived' },
            { status: 'active' },
          ],
        },
      })

      const raw = storage.get('ses:v1:acc_test123:testStore5')
      expect(raw).toBeDefined()
      const parsed = JSON.parse(raw!)
      expect(parsed.data).toEqual([{ status: 'active' }, { status: 'active' }])
    })

    it('skips stores without persist option', () => {
      mockAccountId = 'acc_test123'

      createPiniaWithPlugin()

      const useTestStore = defineStore('noPersist', {
        state: () => ({ _byAccount: {} as Record<string, unknown[]> }),
      })

      const store = useTestStore()
      store.$patch({ _byAccount: { acc_test123: [{ id: 'x' }] } })

      expect(storage.has('ses:v1:acc_test123:noPersist')).toBe(false)
    })

    it('does not persist when accountId becomes null during subscribe', () => {
      mockAccountId = 'acc_test123'

      createPiniaWithPlugin()

      const useTestStore = defineStore('testStore6', {
        state: () => ({ _byAccount: {} as Record<string, unknown[]> }),
        persist: { accountKeyedRef: '_byAccount' },
      })

      const store = useTestStore()

      // Simulate account going null after store creation
      mockAccountId = null
      store.$patch({ _byAccount: { acc_test123: [{ id: 'y' }] } })

      expect(storage.has('ses:v1:acc_test123:testStore6')).toBe(false)
    })

    it('uses default _byAccount ref name when accountKeyedRef not specified', () => {
      const cachedData = { visible: [], hidden: [] }
      const envelope = { data: cachedData, writtenAt: Date.now() - 1000 }
      storage.set('ses:v1:acc_test123:testStore7', JSON.stringify(envelope))
      mockAccountId = 'acc_test123'

      createPiniaWithPlugin()

      const useTestStore = defineStore('testStore7', {
        state: () => ({ _byAccount: {} as Record<string, unknown> }),
        persist: {},
      })

      const store = useTestStore()
      expect(store._byAccount['acc_test123']).toEqual(cachedData)
    })

    it('uses correct key format: ses:v1:{accountId}:{storeId}', () => {
      mockAccountId = 'acc_test123'

      createPiniaWithPlugin()

      const useTestStore = defineStore('myCustomStore', {
        state: () => ({ _byAccount: {} as Record<string, unknown[]> }),
        persist: { accountKeyedRef: '_byAccount' },
      })

      const store = useTestStore()
      store.$patch({ _byAccount: { acc_test123: ['data'] } })

      expect(storage.has('ses:v1:acc_test123:myCustomStore')).toBe(true)
    })
  })

  // ─────────────────────────────────────────────────────────
  // QuotaExceededError (MUST be last — sets localStorageAvailable=false permanently)
  // ─────────────────────────────────────────────────────────
  describe('writeToLocalStorage — QuotaExceededError (destructive)', () => {
    it('on QuotaExceededError: calls removeAllForAccount and enters no-op mode', () => {
      // Seed keys for the account
      storage.set('ses:v1:acc_test123:arcs', 'data1')
      storage.set('ses:v1:acc_test123:signals', 'data2')
      storage.set('ses:v1:acc_other:arcs', 'other')

      const quotaError = new DOMException('quota exceeded', 'QuotaExceededError')
      localStorageMock.setItem.mockImplementationOnce(() => { throw quotaError })

      writeToLocalStorage('acc_test123', 'arcs', { big: 'payload' })

      // Should have removed keys for acc_test123
      expect(storage.has('ses:v1:acc_test123:arcs')).toBe(false)
      expect(storage.has('ses:v1:acc_test123:signals')).toBe(false)
      // Should NOT remove other account's keys
      expect(storage.has('ses:v1:acc_other:arcs')).toBe(true)
      expect(logger.warn).toHaveBeenCalled()

      // After quota error, further writes are no-ops (localStorageAvailable = false)
      localStorageMock.setItem.mockImplementation((key: string, value: string) => {
        storage.set(key, value)
      })
      writeToLocalStorage('acc_test123', 'arcs', { another: 'write' })
      expect(storage.has('ses:v1:acc_test123:arcs')).toBe(false)

      // Reads also return undefined now (module entered no-op mode)
      storage.set('ses:v1:acc_test123:arcs', JSON.stringify({ data: 'x', writtenAt: Date.now() }))
      expect(readFromLocalStorage('acc_test123', 'arcs')).toBeUndefined()
    })
  })
})
