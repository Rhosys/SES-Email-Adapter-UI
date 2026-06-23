import { vi } from 'vitest'

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
