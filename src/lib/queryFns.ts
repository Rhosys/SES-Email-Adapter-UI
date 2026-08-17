import type { Result } from 'neverthrow'
import type { ApiError } from './api'

export function unwrap<T>(result: Result<T, ApiError>): T {
  if (result.isErr()) throw result.error
  return result.value
}
