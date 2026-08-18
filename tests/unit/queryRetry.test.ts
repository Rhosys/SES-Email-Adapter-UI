import { describe, it, expect } from 'vitest'
import { shouldRetry } from '@/lib/queryRetry'
import { ApiError } from '@/lib/api'

describe('shouldRetry', () => {
  it.each([
    { status: 500, desc: '500 Internal Server Error' },
    { status: 502, desc: '502 Bad Gateway' },
    { status: 503, desc: '503 Service Unavailable' },
  ])('retries on $desc (failureCount < 3)', ({ status }) => {
    expect(shouldRetry(0, new ApiError(status, 'fail'))).toBe(true)
    expect(shouldRetry(2, new ApiError(status, 'fail'))).toBe(true)
  })

  it('retries on network error (status 0)', () => {
    expect(shouldRetry(0, new ApiError(0, 'Network error'))).toBe(true)
    expect(shouldRetry(2, new ApiError(0, 'Network error'))).toBe(true)
  })

  it('stops retrying after MAX_RETRIES (3)', () => {
    expect(shouldRetry(3, new ApiError(500, 'fail'))).toBe(false)
    expect(shouldRetry(4, new ApiError(0, 'Network error'))).toBe(false)
  })

  it.each([
    { status: 400, desc: '400 Bad Request' },
    { status: 401, desc: '401 Unauthorized' },
    { status: 403, desc: '403 Forbidden' },
    { status: 404, desc: '404 Not Found' },
    { status: 409, desc: '409 Conflict' },
    { status: 422, desc: '422 Unprocessable' },
  ])('never retries on $desc', ({ status }) => {
    expect(shouldRetry(0, new ApiError(status, 'client error'))).toBe(false)
  })

  it('retries unknown errors once as a safety net', () => {
    const unknownError = new Error('something unexpected')
    expect(shouldRetry(0, unknownError)).toBe(true)
    expect(shouldRetry(1, unknownError)).toBe(false)
  })

  it('does not retry unknown errors when failureCount >= 1', () => {
    expect(shouldRetry(1, new TypeError('oops'))).toBe(false)
    expect(shouldRetry(2, { message: 'random object' })).toBe(false)
  })
})
