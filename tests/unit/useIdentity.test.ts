import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loginClient } from '@/lib/auth'
import { useIdentity } from '@/composables/useIdentity'

describe('useIdentity', () => {
  beforeEach(() => {
    vi.mocked(loginClient.getUserIdentity).mockReturnValue({})
  })

  it('returns null-ish defaults before load() is called', () => {
    const identity = useIdentity()
    expect(identity.picture).toBe(null)
    expect(identity.displayName).toBe(null)
    expect(identity.userId).toBe(null)
    expect(identity.email).toBe(null)
    expect(identity.initials).toBe('?')
  })

  it('populates fields from loginClient.getUserIdentity() after load()', () => {
    vi.mocked(loginClient.getUserIdentity).mockReturnValue({
      userId: 'user_1',
      email: 'jane@example.com',
      name: 'Jane Doe',
      picture: 'https://example.com/pic.png',
    })
    const identity = useIdentity()
    identity.load()

    expect(identity.picture).toBe('https://example.com/pic.png')
    expect(identity.displayName).toBe('Jane Doe')
    expect(identity.userId).toBe('user_1')
    expect(identity.email).toBe('jane@example.com')
  })

  it('normalizes userId from sub when userId is absent', () => {
    vi.mocked(loginClient.getUserIdentity).mockReturnValue({ sub: 'sub_123' })
    const identity = useIdentity()
    identity.load()

    expect(identity.userId).toBe('sub_123')
  })

  it('prefers userId over sub when both are present', () => {
    vi.mocked(loginClient.getUserIdentity).mockReturnValue({ userId: 'user_1', sub: 'sub_123' })
    const identity = useIdentity()
    identity.load()

    expect(identity.userId).toBe('user_1')
  })

  it('falls back displayName to email when name is absent', () => {
    vi.mocked(loginClient.getUserIdentity).mockReturnValue({ email: 'jane@example.com' })
    const identity = useIdentity()
    identity.load()

    expect(identity.displayName).toBe('jane@example.com')
  })

  it('derives initials from a two-word name', () => {
    vi.mocked(loginClient.getUserIdentity).mockReturnValue({ name: 'Jane Doe' })
    const identity = useIdentity()
    identity.load()

    expect(identity.initials).toBe('JD')
  })

  it('derives initials from a one-word name', () => {
    vi.mocked(loginClient.getUserIdentity).mockReturnValue({ name: 'Cher' })
    const identity = useIdentity()
    identity.load()

    expect(identity.initials).toBe('CH')
  })

  it('derives initials from email when name is absent', () => {
    vi.mocked(loginClient.getUserIdentity).mockReturnValue({ email: 'jane@example.com' })
    const identity = useIdentity()
    identity.load()

    expect(identity.initials).toBe('JA')
  })

  it('falls back initials to "?" when neither name nor email is present', () => {
    vi.mocked(loginClient.getUserIdentity).mockReturnValue({})
    const identity = useIdentity()
    identity.load()

    expect(identity.initials).toBe('?')
  })

  it('warns and leaves identity unset if getUserIdentity() throws', () => {
    vi.mocked(loginClient.getUserIdentity).mockImplementation(() => {
      throw new Error('boom')
    })
    const identity = useIdentity()
    expect(() => identity.load()).not.toThrow()
    expect(identity.userId).toBe(null)
  })
})
