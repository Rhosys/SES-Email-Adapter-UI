import { vi } from 'vitest'

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
