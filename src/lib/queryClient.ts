import { QueryClient, QueryCache, MutationCache } from '@tanstack/vue-query'
import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core'
import { get, set, del } from 'idb-keyval'
import { broadcastQueryClient } from '@tanstack/query-broadcast-client-experimental'
import { shouldRetry } from './queryRetry'
import logger from '@/lib/logger'
import buildInfo from '@/lib/buildInfo'

const { persisterFn, restoreQueries } = experimental_createQueryPersister({
  storage: { getItem: get, setItem: set, removeItem: del },
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

// Bulk-restores every persisted query from IndexedDB into the cache in one go. Awaited
// in main.ts before mount, inside the existing auth/router boot screen (App.vue's
// `resolving`) — so cached threads are already in memory by the time a view's query
// runs, instead of each query lazily restoring its own entry mid-render and briefly
// reporting isLoading=true (no data yet) even though a cached copy exists.
export function restoreQueryCache() {
  return restoreQueries(queryClient)
}
