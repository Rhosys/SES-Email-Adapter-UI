import type { PiniaPluginContext } from "pinia"
import logger from "@/lib/logger"
import { useAccountStore } from "@/stores/account"

const VERSION = 1
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface PersistOptions {
  /** Which top-level state key holds per-account data (default: '_byAccount') */
  accountKeyedRef?: string
  /** Filter applied to items array before writing (e.g., only active threads) */
  filter?: (items: unknown[]) => unknown[]
}

declare module "pinia" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface DefineStoreOptionsBase<S, Store> {
    persist?: PersistOptions
  }
}

interface CacheEnvelope<T> {
  data: T
  writtenAt: number
}

function buildKey(accountId: string, storeId: string): string {
  return `ses:v${VERSION}:${accountId}:${storeId}`
}

/** Whether localStorage is usable in this environment. */
let localStorageAvailable = false

try {
  const testKey = "__ses_ls_test__"
  localStorage.setItem(testKey, "1")
  const read = localStorage.getItem(testKey)
  localStorage.removeItem(testKey)
  localStorageAvailable = read === "1"
} catch (e) {
  logger.warn({ title: "localStorage unavailable", error: e })
  localStorageAvailable = false
}

export function readFromLocalStorage<T>(accountId: string, storeId: string): T | undefined {
  if (!localStorageAvailable) return undefined

  const key = buildKey(accountId, storeId)
  const raw = localStorage.getItem(key)
  if (raw === null) return undefined

  let envelope: CacheEnvelope<T>
  try {
    envelope = JSON.parse(raw) as CacheEnvelope<T>
  } catch (e) {
    if (e instanceof SyntaxError) {
      localStorage.removeItem(key)
      logger.warn({ title: "Cache read: corrupted JSON removed", key })
    }
    return undefined
  }

  if (!envelope.writtenAt || Date.now() - envelope.writtenAt > MAX_AGE_MS) {
    localStorage.removeItem(key)
    return undefined
  }

  return envelope.data
}

export function writeToLocalStorage(accountId: string, storeId: string, data: unknown): void {
  if (!localStorageAvailable) return

  const key = buildKey(accountId, storeId)
  const envelope: CacheEnvelope<unknown> = { data, writtenAt: Date.now() }

  try {
    localStorage.setItem(key, JSON.stringify(envelope))
  } catch (e) {
    logger.warn({ title: "Cache write failed", key, error: e })
    // On QuotaExceededError: remove all entries for current account, enter no-op
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      removeAllForAccount(accountId)
      localStorageAvailable = false
    }
  }
}

export function removeAllForAccount(accountId: string): void {
  if (typeof localStorage === "undefined") return

  const prefix = `ses:v${VERSION}:${accountId}:`
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key)
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key)
  }
}

export function persistentStorePlugin(context: PiniaPluginContext): void {
  const { options, store } = context
  const config = options.persist
  if (!config) return

  const refName = config.accountKeyedRef ?? "_byAccount"

  const accountStore = useAccountStore()
  const accountId = accountStore.accountId

  // Hydrate from cache if accountId is available
  if (accountId) {
    const cached = readFromLocalStorage<unknown>(accountId, store.$id)
    if (cached !== undefined) {
      const current = (store.$state as Record<string, unknown>)[refName] as
        | Record<string, unknown>
        | undefined
      store.$patch((state) => {
        ;(state as Record<string, Record<string, unknown>>)[refName] = {
          ...current,
          [accountId]: cached,
        }
      })
    }
  }

  // Auto-persist on every mutation (sync flush: write to localStorage immediately)
  store.$subscribe((_mutation, state) => {
    const id = accountStore.accountId
    if (!id) return

    const byAccount = (state as Record<string, unknown>)[refName] as
      | Record<string, unknown>
      | undefined
    if (!byAccount) return

    const accountData = byAccount[id]
    if (accountData === undefined) return

    let toWrite: unknown = accountData
    if (config.filter && Array.isArray(accountData)) {
      toWrite = config.filter(accountData)
    }

    writeToLocalStorage(id, store.$id, toWrite)
  }, { flush: 'sync' })
}
