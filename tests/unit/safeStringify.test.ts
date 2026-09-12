import { describe, it, expect, vi } from 'vitest'

vi.unmock('@/lib/logger')
const { safeStringify } = await import('@/lib/logger')

describe('safeStringify', () => {
  it('captures message and name from an Error instead of serializing to {}', () => {
    const result = JSON.parse(safeStringify({ title: 'Vue error', error: new Error('boom'), info: 'render' }))

    expect(result.error).not.toEqual({})
    expect(result.error.message).toBe('boom')
  })
})
