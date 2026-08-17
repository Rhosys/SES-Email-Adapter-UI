import { vi, beforeEach } from 'vitest'
import { config } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'

// Fresh QueryClient shared per-test between the global mock and mount() plugin.
let testQueryClient: QueryClient

// ECharts' CanvasRenderer fires async paint cycles via zrender that call clearRect on a canvas
// context jsdom doesn't provide. Stubbing VChart avoids uncaught exceptions from the render loop.
vi.mock('vue-echarts', () => ({
  default: { template: '<div class="vchart-stub" />' },
}))

vi.mock('@/lib/buildInfo', () => ({
  default: {
    version: { releaseDate: 'test', buildNumber: 'test', buildRef: 'test', buildCommit: 'test' },
    deployment: { fdqn: 'localhost', logTarget: 'LOCAL' },
  },
}))

vi.mock('@/lib/auth', () => ({
  loginClient: {
    userSessionExists: vi.fn().mockResolvedValue(true),
    ensureToken: vi.fn().mockResolvedValue('test-token'),
    getUserIdentity: vi.fn().mockReturnValue({ sub: 'user_test123' }),
    authenticate: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/logger', () => ({
  default: {
    critical: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    track: vi.fn(),
    debug: vi.fn(),
    setContext: vi.fn(),
    setRouteGetter: vi.fn(),
    setHistorySink: vi.fn(),
    flush: vi.fn(),
    flushOnUnload: vi.fn(),
  },
}))

// Provide VueQueryPlugin globally so any component that transitively calls
// useQueryClient() (e.g. via useSignalsStore) gets a valid QueryClient context.
// Also mock the composable for stores called outside of mount() (e.g. in beforeEach).
vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>()
  return {
    ...actual,
    useQueryClient: (...args: Parameters<typeof actual.useQueryClient>) => {
      try {
        return actual.useQueryClient(...args)
      } catch {
        return testQueryClient
      }
    },
  }
})

beforeEach(() => {
  testQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  config.global.plugins = [[VueQueryPlugin, { queryClient: testQueryClient }]]
})
