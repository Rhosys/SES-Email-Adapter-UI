import { QueryClient, QueryCache, MutationCache, focusManager } from '@tanstack/vue-query'
import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core'
import { get, set, del, entries } from 'idb-keyval'
import { broadcastQueryClient } from '@tanstack/query-broadcast-client-experimental'
import { shouldRetry } from './queryRetry'
import logger from '@/lib/logger'
import buildInfo from '@/lib/buildInfo'

// Coalesces rapid-fire writes to the same IndexedDB key into one, keeping only the latest
// value — without this, every query that resolves schedules its own immediate `set()`, so a
// thread list page load (dozens of queries settling within milliseconds) hammers IndexedDB
// with one write per query instead of one write per key per window.
function throttleSetByKey(fn: typeof set, wait: number): typeof set {
  const timers = new Map<IDBValidKey, ReturnType<typeof setTimeout>>()
  const latestValue = new Map<IDBValidKey, unknown>()
  const latestResolvers = new Map<IDBValidKey, Array<() => void>>()

  return (key, value) => {
    latestValue.set(key, value)
    return new Promise<void>((resolve) => {
      const resolvers = latestResolvers.get(key) ?? []
      resolvers.push(resolve)
      latestResolvers.set(key, resolvers)

      if (timers.has(key)) return

      const timer = setTimeout(() => {
        timers.delete(key)
        const valueToWrite = latestValue.get(key)
        const resolversToCall = latestResolvers.get(key) ?? []
        latestValue.delete(key)
        latestResolvers.delete(key)
        fn(key, valueToWrite).finally(() => resolversToCall.forEach((r) => r()))
      }, wait)
      timers.set(key, timer)
    })
  }
}

const { persisterFn, restoreQueries } = experimental_createQueryPersister({
  storage: { getItem: get, setItem: throttleSetByKey(set, 1_000), removeItem: del, entries },
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  prefix: `ses:${buildInfo.version.buildCommit}:`,
  buster: buildInfo.version.buildCommit,
})

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      gcTime: Infinity,
      retry: shouldRetry,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      networkMode: 'online',
      structuralSharing: true,
      throwOnError: false,
      retryOnMount: true,
      persister: persisterFn,
    },
    mutations: {
      retry: shouldRetry,
      networkMode: 'online',
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      logger.error({
        code: 'query.failed',
        queryKey: query.queryKey,
        error,
        failureCount: query.state.fetchFailureCount,
        status: query.state.status,
      })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, variables, _context, mutation) => {
      logger.error({
        code: 'mutation.failed',
        mutationKey: mutation.options.mutationKey,
        variables,
        error,
      })
    },
  }),
})

try { broadcastQueryClient({ queryClient, broadcastChannel: 'ses-query-sync' }) } catch { /* BroadcastChannel unavailable — single-tab mode */ }

// TanStack's default focusManager only binds `visibilitychange`, which fires on tab switch and
// minimize — but NOT when the user alt-tabs to another OS application while the browser window
// stays visible. Adding a window `focus` listener covers that case. No throttling here: how often
// a focus event actually triggers a network fetch is governed by each query's staleTime (the
// thread list uses a 5-minute staleTime), and TanStack tracks the last-fetch time per query.
focusManager.setEventListener((handleFocus) => {
  const onFocus = () => handleFocus(true)
  const onVisibility = () => handleFocus(document.visibilityState === 'visible')

  window.addEventListener('focus', onFocus, false)
  document.addEventListener('visibilitychange', onVisibility, false)

  return () => {
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
  }
})

// Bulk-restores every persisted query from IndexedDB into the cache in one go. Awaited
// in main.ts before mount, inside the existing auth/router boot screen (App.vue's
// `resolving`) — so cached threads are already in memory by the time a view's query
// runs, instead of each query lazily restoring its own entry mid-render and briefly
// reporting isLoading=true (no data yet) even though a cached copy exists.
export function restoreQueryCache() {
  return restoreQueries(queryClient)
}
