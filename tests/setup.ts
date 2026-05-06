import { vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  loginClient: {
    userSessionExists: vi.fn().mockResolvedValue(true),
    ensureToken: vi.fn().mockResolvedValue('test-token'),
    getUserIdentity: vi.fn().mockReturnValue({ sub: 'user_test123' }),
    authenticate: vi.fn().mockResolvedValue(undefined),
  },
}))
