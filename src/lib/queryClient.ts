import { QueryClient, QueryCache, MutationCache } from '@tanstack/vue-query'
import { experimental_createQueryPersister } from '@tanstack/query-persist-client-core'
import { get, set, del } from 'idb-keyval'
import { broadcastQueryClient } from '@tanstack/query-broadcast-client-experimental'
import { shouldRetry } from './queryRetry'
import logger from '@/lib/logger'
import buildInfo from '@/lib/buildInfo'

const { persisterFn } = experimental_createQueryPersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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

broadcastQueryClient({ queryClient, broadcastChannel: 'ses-query-sync' })
