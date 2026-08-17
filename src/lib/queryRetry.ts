import { ApiError } from './api'

const MAX_RETRIES = 3

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false
  if (error instanceof ApiError) {
    if (error.status === 0) return true // network error
    if (error.status >= 500) return true // server error
    return false // 4xx — don't retry
  }
  // Unknown errors — retry once as a safety net
  return failureCount < 1
}
